/** Sends only the chosen site's session after explicit permission and destination confirmation.
 * @param {object} station - Verified origin, preferred tab and browser mode.
 * @param {string} domain - Supported source chosen by the owner.
 * @returns {Promise<object>} Fixed status; cookie values are not returned to popup controls.
 */
async function sendSelectedSession(station, domain) {
  if (!['instagram.com', 'deviantart.com'].includes(domain)) {
    throw new Error('Choose Instagram or DeviantArt.');
  }
  // Keep this request directly within the Send click's user gesture.
  const allowed = await chrome.permissions.request({ origins: [`https://*.${domain}/*`] });
  if (!allowed) {
    throw new Error('Source permission was not granted. No session was sent.');
  }
  const destination = await globalThis.LinkDockCompanion.findStationTab(station);
  if (!destination) {
    throw new Error('Open your station and sign in, or reconnect it to restore permission.');
  }
  const stores = await chrome.cookies.getAllCookieStores();
  const store = stores.find((entry) => entry.tabIds.includes(destination.id));
  if (!store) {
    throw new Error('Could not identify this browser profile. Reopen the station in a normal tab.');
  }
  const cookies = globalThis.LinkDockCompanion.sessionExport(
    await chrome.cookies.getAll({ domain, storeId: store.id }),
    domain,
  );
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: destination.id },
    world: 'ISOLATED',
    func: globalThis.LinkDockCompanion.sendToStation,
    args: [station.origin, cookies, navigator.userAgent],
  });
  return result?.result ?? { ok: false, message: 'No response. Reopen the LinkDock tab and retry.' };
}

Object.assign(globalThis.LinkDockCompanion, { sendSelectedSession });
