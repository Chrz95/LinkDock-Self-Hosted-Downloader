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
 * @param {string} [extensionOrigin] - Extension identity when pairing is explicitly requested.
 * @returns {Promise<object>} Fixed identity result, never account or cookie details.
 */
async function identifyStation(expectedOrigin, extensionOrigin) {
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
    if (extensionOrigin) {
      if (location.origin !== expectedOrigin) {
        return { ok: false, message: 'The destination tab changed. Connect your station again.' };
      }
      const paired = await fetch('/api/companions', {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extensionOrigin }),
      });
      if (!paired.ok) {
        return { ok: false, message: 'Use LinkDock 2.31 or newer and check companion connections in Settings.' };
      }
      const result = await paired.json();
      if (!/^ldc_[a-f\d]{64}$/u.test(result.token ?? '') || !result.connection?.id || !result.connection?.expiresAt) {
        return { ok: false, message: 'The station did not return a valid companion connection.' };
      }
      return { ok: true, token: result.token, connection: result.connection };
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
    args: [origin, chrome.runtime.getURL('').replace(/\/$/u, '')],
  });
  if (!result?.result?.ok) {
    return { ok: false, message: 'Could not pair. Use LinkDock 2.31 or newer, sign in and check companion Settings.' };
  }
  if (!/^ldc_[a-f\d]{64}$/u.test(result.result.token ?? '')) {
    return { ok: false, message: 'Update LinkDock to 2.31 or newer, then reconnect this companion.' };
  }
  station.tabId = tab.id;
  station.token = result.result.token;
  station.connection = result.result.connection;
  const storageKey = incognito ? 'stationIncognito' : 'station';
  const previous = (await chrome.storage.local.get(storageKey))[storageKey];
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await chrome.storage.local.set({ [storageKey]: station });
  } catch {
    await globalThis.LinkDockCompanion.pairedRequest(station, 'connection').catch(() => undefined);
    return { ok: false, message: 'Could not save the companion connection. Check extension storage permissions.' };
  }
  let previousRevoked = true;
  if (previous?.token) {
    try {
      previousRevoked = (await globalThis.LinkDockCompanion.pairedRequest(previous, 'connection')).ok;
    } catch {
      previousRevoked = false;
    }
  }
  return {
    ok: true,
    station,
    message: previousRevoked
      ? 'Companion paired. Downloads now work with the station tab closed.'
      : 'Companion paired. An older connection could not be revoked; review Browser companions in station Settings.',
  };
}

Object.assign(globalThis.LinkDockCompanion, { stationOrigin, stationPattern, findStationTab, connectStation });
