const source = document.getElementById('source');
const send = document.getElementById('send');
const confirmation = document.getElementById('confirm');
const status = document.getElementById('status');
let station;
let sending = false;
source.addEventListener('change', () => {
  document.getElementById('login').href = `https://www.${source.value}/`;
  status.textContent = '';
});
confirmation.addEventListener('change', () => {
  send.disabled = !station || !confirmation.checked || sending;
});
chrome.tabs
  .query({ active: true, currentWindow: true })
  .then(([tab]) => {
    const url = new URL(tab?.url ?? 'about:blank');
    if (!['http:', 'https:'].includes(url.protocol) || !tab?.id) {
      throw new Error('Open your LinkDock tab first.');
    }
    station = { tabId: tab.id, origin: url.origin };
    document.getElementById('destination').textContent = url.origin;
    send.disabled = !confirmation.checked;
  })
  .catch(() => {
    status.textContent = 'Open your LinkDock tab, then reopen this companion.';
  });
send.addEventListener('click', async () => {
  if (!station || !confirmation.checked || sending) {
    return;
  }
  sending = true;
  send.disabled = true;
  const domain = source.value;
  const destination = station;
  try {
    // This request is directly within a user gesture; access is limited to the chosen site.
    const allowed = await chrome.permissions.request({ origins: [`https://*.${domain}/*`] });
    if (!allowed) {
      throw new Error('Source permission was not granted. No session was sent.');
    }
    const stores = await chrome.cookies.getAllCookieStores();
    const store = stores.find((entry) => entry.tabIds.includes(destination.tabId));
    if (!store) {
      throw new Error('Could not identify this browser profile. Reopen the station in a normal tab.');
    }
    const cookies = globalThis.LinkDockCompanion.sessionExport(
      await chrome.cookies.getAll({ domain, storeId: store.id }),
      domain,
    );
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: destination.tabId },
      world: 'ISOLATED',
      func: globalThis.LinkDockCompanion.sendToStation,
      args: [destination.origin, cookies, navigator.userAgent],
    });
    status.textContent = result?.result?.message ?? 'No response. Reopen the LinkDock tab and retry.';
  } catch (error) {
    // Never display extension/runtime errors: they might include script arguments containing credentials.
    status.textContent =
      error instanceof Error &&
      /^(?:No session|Instagram login|Source permission|Could not identify)/u.test(error.message)
        ? error.message
        : 'Session transfer failed. Check the selected source, station tab and browser permissions.';
  } finally {
    sending = false;
    send.disabled = !confirmation.checked;
  }
});
