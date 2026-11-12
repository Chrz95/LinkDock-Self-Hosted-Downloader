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
 * @returns {boolean} Whether the file is unpaused and clear of browser warnings.
 */
function canCatchDownload(item) {
  return item?.state === 'in_progress' && item.danger === 'safe' && !item.paused && !item.byExtensionId;
}

/** Records only the last outcome, without the file name or link.
 * @param {object} station - Pairing used for the attempt.
 * @param {string} message - Fixed companion status text.
 */
async function recordCapture(station, message) {
  const { result } = globalThis.LinkDockCompanion.downloadCaptureKeys(Boolean(station.incognito));
  await chrome.storage.session?.set({ [result]: { connectionId: station.connection.id, message } }).catch(() => {});
}

/** Queues an eligible browser file and cancels only an active copy after the station receives bytes.
 * @param {object} item - New browser download event.
 */
async function catchBrowserDownload(item) {
  if (!canCatchDownload(item)) {
    return;
  }
  const { id } = item;
  const incognito = item.incognito === true;
  let station;
  try {
    station = await captureStation(incognito);
    if (!station) {
      return;
    }
    const [current] = await chrome.downloads.search({ id });
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
      await recordCapture(
        station,
        'This download stayed in the browser. Capture uses external HTTP or HTTPS file links.',
      );
      return;
    }
    original.hash = '';
    const request = { ...companion.downloadRequest(original.href, 'direct'), browserCapture: true };
    const result = await companion.pairedRequest(station, 'downloads', request);
    if (!result.sourceStarted) {
      await recordCapture(
        station,
        result.message ?? 'LinkDock queued the link but did not confirm file bytes. Check the library for its status.',
      );
      return;
    }
    const enabled = await captureStation(incognito);
    if (enabled?.connection.id === station.connection.id && enabled.origin === station.origin) {
      const [remaining] = await chrome.downloads.search({ id });
      if (canCatchDownload(remaining) && remaining.incognito === incognito) {
        await chrome.downloads.cancel(id);
        await recordCapture(station, 'Handed off to LinkDock. The browser copy was stopped.');
        return;
      }
    }
    await recordCapture(station, 'LinkDock started the file. The browser copy was kept.');
  } catch {
    if (station) {
      await recordCapture(station, 'Could not finish the handoff. Check your browser downloads and LinkDock library.');
    }
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

/** Submits a link from the companion's on-page controls using the sender's browser mode.
 * @param {object} selection - Link and output choice from the isolated content script.
 * @param {object} sender - Browser-provided tab and frame metadata.
 * @returns {Promise<object>} Fixed queue result for the on-page control.
 */
async function submitOverlayDownload(selection, sender) {
  const companion = globalThis.LinkDockCompanion;
  const incognito = Boolean(sender.tab.incognito);
  const { station: key } = companion.downloadCaptureKeys(incognito);
  const station = (await chrome.storage.local.get(key))[key];
  if (!station?.token || Boolean(station.incognito) !== incognito) {
    return { ok: false, message: 'Pair the companion with your LinkDock station first.' };
  }
  const page = new URL(sender.url);
  const target = new URL(selection.url);
  const origin = companion.stationOrigin(station.origin);
  if (
    ![page, target].every((url) => ['http:', 'https:'].includes(url.protocol) && url.origin !== origin) ||
    !['direct', 'video'].includes(selection.sourceType) ||
    (selection.sourceType === 'direct' && selection.quality !== undefined)
  ) {
    return { ok: false, message: 'Choose a file or video on an external website.' };
  }
  const request = companion.downloadRequest(selection.url, selection.sourceType, selection.quality);
  return companion.pairedRequest(station, 'downloads', request);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.type !== 'linkdock-overlay-download' ||
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    !Number.isInteger(sender.tab?.id)
  ) {
    return;
  }
  submitOverlayDownload(message, sender).then(sendResponse, () => {
    sendResponse({ ok: false, message: 'Could not send this link. Check the LinkDock connection and try again.' });
  });
  return true;
});
