/** Parses a station address without accepting embedded passwords or non-web destinations.
 * @param {string} value - Address explicitly supplied by the owner.
 * @returns {string} Exact scheme, host and port used for every station operation.
 */
function stationOrigin(value) {
  try {
    const url = new URL(value.trim());
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
      return url.origin;
    }
  } catch {
    // Browser URL parser diagnostics can contain the supplied address; do not reflect them.
  }
  throw new Error('Enter your station’s HTTP or HTTPS address without a password in the URL.');
}
/** Requests only the station host; exact ports are checked before every injected operation.
 * @param {string} origin - Validated station origin.
 * @returns {string} Browser-compatible host permission pattern.
 */
function stationPattern(origin) {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}
/** Finds an open station without access to unrelated browsing history.
 * @param {object} station - Verified station and browser mode.
 * @returns {Promise<object | undefined>} Matching tab in the same normal/incognito context.
 */
async function findStationTab(station) {
  const origin = stationOrigin(station.origin);
  const pattern = stationPattern(origin);
  if (!(await chrome.permissions.contains({ origins: [pattern] }))) {
    return undefined;
  }
  const candidates = (await chrome.tabs.query({ url: pattern })).filter((tab) => {
    try {
      return (
        Number.isInteger(tab.id) &&
        new URL(tab.url).origin === origin &&
        Boolean(tab.incognito) === Boolean(station.incognito)
      );
    } catch {
      return false;
    }
  });
  return candidates.find((tab) => tab.id === station.tabId) ?? candidates[0];
}
/** Runs inside the station, retaining its same-origin HttpOnly login and CSRF checks.
 * @param {string} expectedOrigin - Address chosen by the owner.
 * @returns {Promise<object>} Fixed identity result, never account or cookie details.
 */
async function identifyStation(expectedOrigin) {
  if (location.origin !== expectedOrigin) {
    return { ok: false, message: 'The destination tab changed. Connect your station again.' };
  }
  try {
    const timeout = 15_000;
    const response = await fetch('/api/browser-access', {
      credentials: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok || (await response.json()).connector !== 'linkdock-browser-access-v1') {
      return { ok: false, message: 'Open LinkDock 2.23 or newer and sign in, then connect again.' };
    }
    return { ok: true, message: 'Station connected. You can now add downloads from any tab.' };
  } catch {
    return { ok: false, message: 'Could not verify this station. Check its address and sign in there first.' };
  }
}
/** Connects a station after an explicit permission grant and same-origin identity check.
 * @param {string} value - Station address from the popup.
 * @param {boolean} incognito - Current browser mode; never mixes cookie stores across modes.
 * @returns {Promise<object>} Verified destination or fixed setup instructions.
 */
async function connectStation(value, incognito) {
  const origin = stationOrigin(value);
  // Must occur within the Connect click, before awaiting any other browser API.
  const granted = await chrome.permissions.request({ origins: [stationPattern(origin)] });
  if (!granted) {
    return { ok: false, message: 'Station permission was not granted. No connection was saved.' };
  }
  const station = { origin, incognito };
  const tab = await findStationTab(station);
  if (!tab) {
    await chrome.tabs.create({ url: origin });
    return { ok: false, message: 'Station opened. Sign in there, then reopen the companion and connect.' };
  }
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'ISOLATED',
    func: identifyStation,
    args: [origin],
  });
  if (!result?.result?.ok) {
    return { ok: false, message: 'Could not connect. Open this station, sign in and try Connect again.' };
  }
  station.tabId = tab.id;
  await chrome.storage.local.set({ station });
  return { ok: true, station, message: 'Station connected. You can now add downloads from any tab.' };
}

Object.assign(globalThis.LinkDockCompanion, { stationOrigin, stationPattern, findStationTab, connectStation });
