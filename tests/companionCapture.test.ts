import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { HTTP_STATUS } from '../shared/contracts';

const TOKEN_LENGTH = 64;
const EXTENSION_ID_LENGTH = 32;
const station = {
  origin: 'http://pi:7489',
  token: `ldc_${'a'.repeat(TOKEN_LENGTH)}`,
  connection: { id: 'paired-connection' },
  incognito: false,
};
const file = {
  id: 17,
  state: 'in_progress',
  danger: 'safe',
  paused: false,
  incognito: false,
  url: 'https://source.example:8443/redirect?signature=example#fragment',
  finalUrl: 'https://cdn.example:8443/archive.zip?signature=example#fragment',
};
type DownloadItem = typeof file & { byExtensionId?: string };

/** Runs the actual background scripts with mocked browser boundaries and the real station request builder.
 * @param {boolean} [permissionGranted] - Whether the Downloads API is exposed at worker startup.
 * @returns {object} Browser events, storage and observable network/cancellation calls.
 */
function captureFixture(permissionGranted = true) {
  const saved: Record<string, unknown> = { station, captureDownloads: station.connection.id };
  const fetch = vi.fn().mockResolvedValue({
    status: HTTP_STATUS.created,
    json: async () => ({ accepted: true, sourceStarted: true }),
  });
  const onAdded = vi.fn<(register: () => void) => void>();
  const onCreated = vi.fn<(listener: (item: DownloadItem) => Promise<void>) => void>();
  const downloads = {
    onCreated: { addListener: onCreated, hasListener: vi.fn(() => onCreated.mock.calls.length > 0) },
    search: vi.fn().mockResolvedValue([file]),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  const chrome = {
    downloads: permissionGranted ? downloads : undefined,
    runtime: {
      getURL: (path = '') => `chrome-extension://${'a'.repeat(EXTENSION_ID_LENGTH)}/${path}`,
      id: 'a'.repeat(EXTENSION_ID_LENGTH),
      onMessage: { addListener: vi.fn() },
    },
    permissions: { onAdded: { addListener: onAdded }, contains: vi.fn().mockResolvedValue(true) },
    notifications: { create: vi.fn().mockResolvedValue('notification') },
    storage: {
      onChanged: { addListener: vi.fn() },
      local: { get: vi.fn(async () => ({ ...saved })) },
      session: { set: vi.fn().mockResolvedValue(undefined) },
    },
    cookies: { getAll: vi.fn() },
  };
  const context = createContext({ chrome, fetch, URL, AbortSignal });
  /** Implements the classic worker's synchronous script loader.
   * @param {string[]} files - Extension script names.
   */
  context.importScripts = (...files: string[]) => {
    for (const name of files) {
      runInContext(readFileSync(`browser-connector/${name}`, 'utf8'), context);
    }
  };
  context.importScripts('background.js');
  /** Invokes the listener registered with the browser for a new download.
   * @param {DownloadItem} [item] - New file event.
   * @returns {Promise<void>} Completion of the handoff attempt.
   */
  function created(item = file): Promise<void> {
    return onCreated.mock.calls[0]![0](item);
  }
  return { chrome, downloads, fetch, onAdded, onCreated, saved, created };
}

it('registers once when Chrome makes the optional Downloads API available', () => {
  const { chrome, downloads, onAdded, onCreated } = captureFixture(false);
  expect(onCreated).not.toHaveBeenCalled();
  chrome.downloads = downloads;
  const [register] = onAdded.mock.calls[0]!;
  register();
  register();
  expect(onCreated).toHaveBeenCalledOnce();
});

it('sends a selected MP3 output from the page through the paired station without forwarding extra fields', async () => {
  const { chrome, fetch } = captureFixture();
  const [receive] = chrome.runtime.onMessage.addListener.mock.calls[0]!;
  const sender = { id: chrome.runtime.id, frameId: 0, tab: { id: file.id }, url: 'https://source.example/watch' };
  const selection = {
    type: 'linkdock-overlay-download',
    url: sender.url,
    sourceType: 'video',
    quality: 'mp3-320',
    browserCapture: true,
  };
  const respond = vi.fn();
  expect(receive(selection, { ...sender, id: 'foreign' }, respond)).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
  expect(receive(selection, sender, respond)).toBe(true);
  await vi.waitFor(() => expect(respond).toHaveBeenCalledWith(expect.objectContaining({ ok: true })));
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    `${station.origin}/api/companion/downloads`,
    expect.objectContaining({
      credentials: 'omit',
      body: JSON.stringify({ url: sender.url, sourceType: 'video', quality: 'mp3-320' }),
    }),
  );
});

it('enables page overlays by default for a paired tab and honors the stored opt-out', async () => {
  const { chrome, saved, fetch } = captureFixture();
  const [receive] = chrome.runtime.onMessage.addListener.mock.calls[0]!;
  const sender = { id: chrome.runtime.id, frameId: 0, tab: { id: file.id }, url: 'https://source.example/watch' };
  const respond = vi.fn();
  expect(receive({ type: 'linkdock-overlay-state' }, sender, respond)).toBe(true);
  await vi.waitFor(() => expect(respond).toHaveBeenLastCalledWith(true));
  saved.downloadOverlays = false;
  expect(receive({ type: 'linkdock-overlay-state' }, sender, respond)).toBe(true);
  await vi.waitFor(() => expect(respond).toHaveBeenLastCalledWith(false));
  delete saved.downloadOverlays;
  respond.mockClear();
  expect(receive({ type: 'linkdock-overlay-state' }, { ...sender, url: station.origin }, respond)).toBe(true);
  await vi.waitFor(() => expect(respond).toHaveBeenCalledExactlyOnceWith(false));
  expect(fetch).not.toHaveBeenCalled();
});

it('queues the original HTTPS URL and cancels only after the station receives file bytes', async () => {
  const { chrome, downloads, fetch, created } = captureFixture();
  let respond: ((body: object) => void) | undefined;
  fetch.mockReturnValueOnce(
    Promise.resolve({
      status: HTTP_STATUS.created,
      json: () =>
        new Promise<object>((resolve) => {
          respond = resolve;
        }),
    }),
  );
  const handoff = created();
  await vi.waitFor(() => expect(respond).toBeDefined());
  expect(downloads.cancel).not.toHaveBeenCalled();
  const request = {
    url: 'https://source.example:8443/redirect?signature=example',
    sourceType: 'direct',
    quality: '1080',
    browserCapture: true,
  };
  expect(fetch).toHaveBeenCalledWith(
    `${station.origin}/api/companion/downloads`,
    expect.objectContaining({ credentials: 'omit', redirect: 'error', body: JSON.stringify(request) }),
  );
  expect(chrome.cookies.getAll).not.toHaveBeenCalled();
  respond?.({ accepted: true, sourceStarted: true });
  await handoff;
  expect(downloads.cancel).toHaveBeenCalledExactlyOnceWith(file.id);
  expect(chrome.notifications.create).toHaveBeenCalledExactlyOnceWith({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'LinkDock caught a download',
    message: 'Handed off to LinkDock. The browser copy was stopped.',
  });
  expect(chrome.storage.session.set).toHaveBeenCalledExactlyOnceWith({
    lastCapture: {
      connectionId: station.connection.id,
      message: 'Handed off to LinkDock. The browser copy was stopped.',
    },
  });
});

it.each([{ accepted: true, sourceStarted: false }, { accepted: true }])(
  'keeps the browser copy running when the station only confirms queue acceptance',
  async (body) => {
    const { downloads, fetch, created } = captureFixture();
    fetch.mockResolvedValueOnce({ status: HTTP_STATUS.created, json: async () => body });
    await created();
    expect(fetch).toHaveBeenCalledOnce();
    expect(downloads.cancel).not.toHaveBeenCalled();
  },
);

it('notifies when the queued station transfer fails and keeps the local browser copy', async () => {
  const { chrome, downloads, fetch, created } = captureFixture();
  fetch.mockResolvedValueOnce({
    status: HTTP_STATUS.created,
    json: async () => ({ accepted: true, sourceStarted: false, sourceFailed: true }),
  });
  await created();
  expect(downloads.cancel).not.toHaveBeenCalled();
  expect(chrome.notifications.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: expect.stringContaining('The browser copy was kept.') }),
  );
  expect(chrome.storage.session.set).toHaveBeenCalledExactlyOnceWith({
    lastCapture: {
      connectionId: station.connection.id,
      message: 'LinkDock could not start the file. The browser copy was kept. Check the failed job in the library.',
    },
  });
});

it.each([HTTP_STATUS.badRequest, HTTP_STATUS.unauthorized, HTTP_STATUS.serverError])(
  'leaves the browser transfer running when the station replies %s',
  async (status) => {
    const { downloads, fetch, created } = captureFixture();
    fetch.mockResolvedValueOnce({ status });
    await created();
    expect(fetch).toHaveBeenCalledOnce();
    expect(downloads.cancel).not.toHaveBeenCalled();
  },
);

it('leaves the browser transfer running after a network failure and does not retry', async () => {
  const { downloads, fetch, created } = captureFixture();
  fetch.mockRejectedValueOnce(new Error('Station is offline'));
  await created();
  expect(fetch).toHaveBeenCalledOnce();
  expect(downloads.cancel).not.toHaveBeenCalled();
});

it.each([
  { url: `${station.origin}/api/downloads/file` },
  { finalUrl: `${station.origin}/api/downloads/file` },
  { finalUrl: 'blob:https://source.example/browser-only' },
  { finalUrl: 'https://user:password@source.example/file' },
  { danger: 'dangerous' },
  { byExtensionId: 'another-extension' },
  { paused: true },
])('skips an ineligible download %o', async (fields) => {
  const { downloads, fetch, created } = captureFixture();
  const current = { ...file, ...fields };
  downloads.search.mockResolvedValueOnce([current]);
  await created(current);
  expect(fetch).not.toHaveBeenCalled();
  expect(downloads.cancel).not.toHaveBeenCalled();
});

it('requires a matching opt-in and pairing for the current browser mode', async () => {
  const { downloads, fetch, saved, created } = captureFixture();
  saved.captureDownloads = 'previous-pairing';
  await created();
  saved.captureDownloads = station.connection.id;
  const privateFile = { ...file, incognito: true };
  await created(privateFile);
  expect(fetch).not.toHaveBeenCalled();
  const privateStation = { ...station, origin: 'https://private-station.example', incognito: true };
  saved.stationIncognito = privateStation;
  saved.captureDownloadsIncognito = privateStation.connection.id;
  downloads.search.mockResolvedValue([privateFile]);
  await created(privateFile);
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`${privateStation.origin}/api/companion/downloads`, expect.anything());
});

it('leaves a finished browser copy and respects turning capture off during an in-flight request', async () => {
  const { downloads, fetch, saved, created } = captureFixture();
  downloads.search.mockResolvedValueOnce([file]).mockResolvedValueOnce([{ ...file, state: 'complete' }]);
  await created();
  expect(fetch).toHaveBeenCalledOnce();
  expect(downloads.cancel).not.toHaveBeenCalled();
  fetch.mockClear();
  fetch.mockImplementationOnce(async () => {
    delete saved.captureDownloads;
    return { status: HTTP_STATUS.created, json: async () => ({ accepted: true, sourceStarted: true }) };
  });
  await created();
  expect(fetch).toHaveBeenCalledOnce();
  expect(downloads.cancel).not.toHaveBeenCalled();
});
