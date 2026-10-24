const ui = Object.fromEntries(
  [
    'source',
    'send',
    'confirm',
    'status',
    'login',
    'destination',
    'station-address',
    'connect',
    'forget',
    'download-url',
    'download-source',
    'quality',
    'add-download',
    'use-page',
    'open-station',
    'station-setup',
    'mode',
  ].map((id) => [id, document.getElementById(id)]),
);
const companion = globalThis.LinkDockCompanion;
const state = { station: undefined, active: undefined, busy: false };

/** Refreshes controls without storing URLs, cookies or station passwords. */
function renderControls() {
  const connected = Boolean(state.station);
  ui.send.disabled = state.busy || !connected || !ui.confirm.checked;
  ui['add-download'].disabled = state.busy || !connected || !ui['download-url'].value.trim();
  ui.connect.disabled = state.busy || !ui['station-address'].value.trim();
  ui.forget.disabled = state.busy || !connected;
  for (const id of ['source', 'confirm', 'station-address', 'download-url', 'download-source', 'quality']) {
    ui[id].disabled = state.busy;
  }
  ui['use-page'].disabled =
    state.busy ||
    !state.active?.url ||
    !/^https?:/u.test(state.active.url) ||
    new URL(state.active.url).origin === state.station?.origin;
  ui.destination.textContent = state.station?.origin ?? 'Connect your station to get started';
  ui.mode.textContent = connected ? 'STATION SAVED' : 'NO STATION';
  ui['open-station'].hidden = !connected;
  ui['open-station'].href = connected ? `${state.station.origin}/#library` : '#';
}
/** Shows only authored status text with a visible success/error distinction.
 * @param {object} result - Fixed operation result from the station boundary.
 */
function showResult(result) {
  ui.status.textContent = result?.message ?? 'No response. Open your station and try again.';
  ui.status.dataset.kind = result?.ok ? 'success' : 'error';
  ui.status.scrollIntoView?.({ block: 'nearest' });
}
/** Runs one popup operation at a time and suppresses potentially secret runtime errors.
 * @param {() => Promise<object>} action - Explicit owner operation; permission calls occur before its first await.
 */
async function runAction(action) {
  if (state.busy) {
    return;
  }
  state.busy = true;
  ui.status.textContent = 'Working…';
  delete ui.status.dataset.kind;
  renderControls();
  try {
    showResult(await action());
  } catch (error) {
    const message =
      error instanceof Error &&
      /^(?:Enter |Choose |No session|Instagram login|Source permission|Could not identify|Open your station)/u.test(
        error.message,
      )
        ? error.message
        : 'Could not complete this action. Check your station, permissions and connection.';
    showResult({ ok: false, message });
  } finally {
    state.busy = false;
    renderControls();
  }
}
ui.connect.addEventListener('click', () =>
  runAction(async () => {
    const result = await companion.connectStation(ui['station-address'].value, Boolean(state.active?.incognito));
    if (result.ok) {
      state.station = result.station;
      ui.confirm.checked = false;
      ui['station-setup'].open = false;
      if (state.active?.url && new URL(state.active.url).origin === state.station.origin) {
        ui['download-url'].value = '';
      }
    }
    return result;
  }),
);
ui.forget.addEventListener('click', () =>
  runAction(async () => {
    await chrome.storage.local.remove('station');
    state.station = undefined;
    ui.confirm.checked = false;
    ui['station-setup'].open = true;
    return { ok: true, message: 'Station forgotten. Browser site permissions can be managed in extension settings.' };
  }),
);
ui['add-download'].addEventListener('click', () =>
  runAction(async () => {
    if (!state.station) {
      return { ok: false, message: 'Connect your station first.' };
    }
    const request = companion.downloadRequest(ui['download-url'].value, ui['download-source'].value, ui.quality.value);
    const destination = await companion.findStationTab(state.station);
    if (!destination) {
      return { ok: false, message: 'Open your station and sign in, or reconnect it to restore permission.' };
    }
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: destination.id },
      world: 'ISOLATED',
      func: companion.submitDownloadToStation,
      args: [state.station.origin, request],
    });
    return result?.result;
  }),
);
ui.send.addEventListener('click', () => {
  if (state.station && ui.confirm.checked) {
    void runAction(() => companion.sendSelectedSession(state.station, ui.source.value));
  }
});
ui.source.addEventListener('change', () => {
  ui.login.href = `https://www.${ui.source.value}/`;
  ui.confirm.checked = false;
  renderControls();
});
ui.confirm.addEventListener('change', renderControls);
ui['station-address'].addEventListener('input', renderControls);
ui['download-url'].addEventListener('input', renderControls);
ui['use-page'].addEventListener('click', () => {
  if (state.active?.url && /^https?:/u.test(state.active.url)) {
    ui['download-url'].value = state.active.url;
    renderControls();
  }
});
/** Restores only the destination and suggests the current page without contacting its site.
 * @returns {Promise<void>} Ready popup; source cookies are untouched until Send is clicked.
 */
async function initializePopup() {
  const [[active], saved] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.local.get('station'),
  ]);
  state.active = active;
  if (saved.station && Boolean(saved.station.incognito) === Boolean(active?.incognito)) {
    state.station = { ...saved.station, origin: companion.stationOrigin(saved.station.origin) };
  }
  ui['station-address'].value =
    state.station?.origin ??
    (/^https?:/u.test(active?.url ?? '') && active?.title?.includes('LinkDock') ? new URL(active.url).origin : '');
  if (/^https?:/u.test(active?.url ?? '') && new URL(active.url).origin !== state.station?.origin) {
    ui['download-url'].value = active.url;
  }
  ui['station-setup'].open = !state.station;
  renderControls();
}
initializePopup().catch(() => {
  showResult({ ok: false, message: 'Could not restore the station. Enter its address and connect again.' });
  renderControls();
});
