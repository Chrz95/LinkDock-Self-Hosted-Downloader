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
    'capture-downloads',
    'capture-result',
    'show-overlays',
  ].map((id) => [id, document.getElementById(id)]),
);
const companion = globalThis.LinkDockCompanion;
const state = {
  station: undefined,
  active: undefined,
  busy: false,
  captureEnabled: false,
  captureResult: '',
  overlays: true,
};

/** Refreshes controls without storing URLs, cookies or station passwords. */
function renderControls() {
  const connected = Boolean(state.station);
  ui.send.disabled = state.busy || !connected || !ui.confirm.checked;
  ui['add-download'].disabled = state.busy || !connected || !ui['download-url'].value.trim();
  ui.connect.disabled = state.busy || !ui['station-address'].value.trim();
  ui.forget.disabled = state.busy || !connected;
  ui['capture-downloads'].disabled = state.busy || !state.station?.token || !state.station.connection?.id;
  ui['capture-downloads'].checked = state.captureEnabled;
  ui['capture-result'].textContent = state.captureResult;
  ui['capture-result'].hidden = !state.captureEnabled || !state.captureResult;
  for (const id of ['source', 'confirm', 'station-address', 'download-url', 'download-source', 'quality']) {
    ui[id].disabled = state.busy;
  }
  ui['use-page'].disabled =
    state.busy ||
    !state.active?.url ||
    !/^https?:/u.test(state.active.url) ||
    new URL(state.active.url).origin === state.station?.origin;
  ui['show-overlays'].disabled = state.busy || !state.station?.token;
  ui['show-overlays'].checked = Boolean(state.station?.token) && state.overlays;
  ui.destination.textContent = state.station?.origin ?? 'Connect your station to get started';
  ui.mode.textContent = connected
    ? state.station.token
      ? 'PAIRED · DOWNLOADS ONLY'
      : 'TAB MODE · RECONNECT TO UPGRADE'
    : 'NO STATION';
  ui['open-station'].hidden = !connected;
  ui['open-station'].href = connected ? `${state.station.origin}/#downloads` : '#';
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
      state.captureEnabled = false;
      state.captureResult = '';
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
    const result = await companion.forgetStation(state.station);
    state.station = undefined;
    state.captureEnabled = false;
    state.captureResult = '';
    ui.confirm.checked = false;
    ui['station-setup'].open = true;
    return result;
  }),
);
ui['capture-downloads'].addEventListener('change', () => {
  const enabled = ui['capture-downloads'].checked;
  void runAction(async () => {
    const connection = state.station?.connection?.id;
    if (!state.station?.token || !connection) {
      return { ok: false, message: 'Pair your station to catch browser downloads.' };
    }
    const keys = companion.downloadCaptureKeys(Boolean(state.active?.incognito));
    if (enabled) {
      if (!(await chrome.permissions.request({ permissions: ['downloads'] }))) {
        return { ok: false, message: 'Download permission was declined. Browser download capture is off.' };
      }
      await chrome.storage.local.set({ [keys.capture]: connection });
    } else {
      await chrome.storage.local.remove(keys.capture);
    }
    state.captureEnabled = enabled;
    return { ok: true, message: enabled ? 'Browser download capture is on.' : 'Browser download capture is off.' };
  });
});
ui['add-download'].addEventListener('click', () =>
  runAction(async () => {
    if (!state.station) {
      return { ok: false, message: 'Connect your station first.' };
    }
    const request = companion.downloadRequest(ui['download-url'].value, ui['download-source'].value, ui.quality.value);
    if (state.station.token) {
      return companion.pairedRequest(state.station, 'downloads', request);
    }
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
ui['show-overlays'].addEventListener('change', () => {
  const enabled = ui['show-overlays'].checked;
  void runAction(async () => {
    const { overlays } = companion.downloadCaptureKeys(Boolean(state.active?.incognito));
    await chrome.storage.local.set({ [overlays]: enabled });
    state.overlays = enabled;
    return { ok: true, message: enabled ? 'Page download buttons are on.' : 'Page download buttons are off.' };
  });
});
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
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const regular = companion.downloadCaptureKeys(false);
  const privateMode = companion.downloadCaptureKeys(true);
  const [[active], saved] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.local.get([
      regular.station,
      regular.capture,
      regular.overlays,
      privateMode.station,
      privateMode.capture,
      privateMode.overlays,
    ]),
  ]);
  state.active = active;
  const keys = active?.incognito ? privateMode : regular;
  state.overlays = saved[keys.overlays] !== false;
  const stored = saved[keys.station];
  if (stored && Boolean(stored.incognito) === Boolean(active?.incognito)) {
    state.station = { ...stored, origin: companion.stationOrigin(stored.origin) };
    state.captureEnabled =
      Boolean(stored.token && stored.connection?.id && saved[keys.capture] === stored.connection.id) &&
      (await chrome.permissions.contains({ permissions: ['downloads'] }));
    if (state.captureEnabled) {
      const recent = (await chrome.storage.session?.get(keys.result))?.[keys.result];
      if (recent?.connectionId === stored.connection.id) {
        state.captureResult = recent.message;
      }
    }
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
