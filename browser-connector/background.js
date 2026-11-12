globalThis.LinkDockCompanion = {};
importScripts('station.js', 'download.js', 'paired.js', 'capture.js');

/** Finds the paired station that the owner explicitly enabled for this browser mode.
 * @param {boolean} incognito - Mode reported by the browser download event.
 * @returns {Promise<object | undefined>} Enabled station for this mode only.
 */
async function captureStation(incognito) {
  const keys = globalThis.LinkDockCompanion.downloadCaptureKeys(incognito);
  const saved = await chrome.storage.local.get([keys.station, keys.capture]);
  const station = saved[keys.station];
  if (
    station?.token &&
    station.connection?.id &&
    saved[keys.capture] === station.connection.id &&
    Boolean(station.incognito) === incognito
  ) {
    return station;
  }
}

/** Checks that Chrome is still downloading a file eligible for handoff.
 * @param {object | undefined} item - Browser Downloads API item.
 * @returns {boolean} Whether the file is active, unpaused and clear of browser warnings.
 */
function canCatchDownload(item) {
  return item?.state === 'in_progress' && item.danger === 'safe' && !item.paused && !item.byExtensionId;
}

/** Queues a browser file and cancels its local transfer after the station starts receiving it.
 * @param {object} item - New browser download event.
 */
async function catchBrowserDownload(item) {
  if (!canCatchDownload(item)) {
    return;
  }
  const incognito = item.incognito === true;
  try {
    const station = await captureStation(incognito);
    if (!station) {
      return;
    }
    const [current] = await chrome.downloads.search({ id: item.id });
    if (!canCatchDownload(current) || current.incognito !== incognito) {
      return;
    }
    const companion = globalThis.LinkDockCompanion;
    const origin = companion.stationOrigin(station.origin);
    const original = new URL(current.url);
    const target = new URL(current.finalUrl || current.url);
    if (
      [original, target].some(
        (url) => !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin === origin,
      )
    ) {
      return;
    }
    original.hash = '';
    const request = { ...companion.downloadRequest(original.href, 'direct'), browserCapture: true };
    const result = await companion.pairedRequest(station, 'downloads', request);
    if (!result.sourceStarted) {
      return;
    }
    const enabled = await captureStation(incognito);
    if (enabled?.connection.id === station.connection.id && enabled.origin === station.origin) {
      const [remaining] = await chrome.downloads.search({ id: item.id });
      if (canCatchDownload(remaining) && remaining.incognito === incognito) {
        await chrome.downloads.cancel(item.id);
      }
    }
  } catch {
    // Storage, permission or network errors leave the browser download running.
  }
}

/** Registers synchronously at worker startup and after the optional permission is granted. */
function registerDownloadCapture() {
  const onCreated = chrome.downloads?.onCreated;
  if (onCreated && !onCreated.hasListener(catchBrowserDownload)) {
    onCreated.addListener(catchBrowserDownload);
  }
}

registerDownloadCapture();
chrome.permissions.onAdded.addListener(registerDownloadCapture);
