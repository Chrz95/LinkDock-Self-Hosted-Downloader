// @vitest-environment jsdom
import { readFileSync, existsSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import {
  closeCompanionPopups,
  companionPopupFixture,
  COMPANION_STATION,
  PAIRED_STATION,
} from './helpers/companionPopupFixture';

const PNG_SIZE_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
afterEach(closeCompanionPopups);

it('loads the saved station and current page without reading cookies or submitting in the background', async () => {
  const { chrome, element } = companionPopupFixture();
  await vi.waitFor(() => expect(element('destination').textContent).toBe(COMPANION_STATION.origin));
  expect(element('download-url').value).toBe('https://www.youtube.com/watch?v=popup-example');
  expect(element('add-download').disabled).toBe(false);
  expect(element('send').disabled).toBe(true);
  expect(chrome.cookies.getAll).not.toHaveBeenCalled();
  expect(chrome.permissions.request).not.toHaveBeenCalled();
  expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('adds a pasted magnet through the remembered station without exporting a session', async () => {
  const { chrome, element, input } = companionPopupFixture();
  await vi.waitFor(() => expect(element('add-download').disabled).toBe(false));
  const url = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567';
  input('download-url', url);
  element('add-download').click();
  await vi.waitFor(() => expect(element('status').textContent).toContain('Download added'));
  expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
    expect.objectContaining({
      target: { tabId: 1 },
      world: 'ISOLATED',
      args: [COMPANION_STATION.origin, { url, sourceType: 'auto', quality: '1080' }],
    }),
  );
  expect(chrome.cookies.getAll).not.toHaveBeenCalled();
  expect(chrome.permissions.request).not.toHaveBeenCalled();
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('retains MP3 choices and prevents concurrent duplicate clicks while the request is pending', async () => {
  const { chrome, element } = companionPopupFixture();
  await vi.waitFor(() => expect(element('add-download').disabled).toBe(false));
  let finish: ((value: object[]) => void) | undefined;
  chrome.scripting.executeScript.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  element('quality').value = 'mp3-192';
  element('add-download').click();
  element('add-download').click();
  await vi.waitFor(() => expect(chrome.scripting.executeScript).toHaveBeenCalledOnce());
  expect(element('add-download').disabled).toBe(true);
  expect(chrome.scripting.executeScript.mock.calls[0]?.[0]?.args[1].quality).toBe('mp3-192');
  finish?.([{ result: { ok: true, message: 'Download added.' } }]);
  await vi.waitFor(() => expect(element('add-download').disabled).toBe(false));
});

it('requires station setup and remembers only a verified destination when Connect is clicked', async () => {
  const { chrome, element, input } = companionPopupFixture(false);
  await vi.waitFor(() => expect(element('download-url').value).toContain('youtube.com'));
  expect(element('add-download').disabled).toBe(true);
  expect(element('station-address').value).toBe('');
  input('station-address', COMPANION_STATION.origin);
  element('connect').click();
  await vi.waitFor(() => expect(element('destination').textContent).toBe(COMPANION_STATION.origin));
  expect(chrome.storage.local.set).toHaveBeenCalledWith({ station: PAIRED_STATION });
  expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['http://pi/*'] });
  expect(element('confirm').checked).toBe(false);
});

it('forgets the station and disables both submissions without clearing server sessions', async () => {
  const { chrome, element } = companionPopupFixture();
  await vi.waitFor(() => expect(element('forget').disabled).toBe(false));
  element('forget').click();
  await vi.waitFor(() => expect(element('status').textContent).toContain('Station forgotten'));
  expect(chrome.storage.local.remove).toHaveBeenCalledWith('station');
  expect(element('add-download').disabled).toBe(true);
  expect(element('send').disabled).toBe(true);
  expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
});

it('retains explicit trust and selected-site permission before any cookie export', async () => {
  const { chrome, element, window } = companionPopupFixture();
  await vi.waitFor(() => expect(element('add-download').disabled).toBe(false));
  element('send').click();
  expect(chrome.cookies.getAll).not.toHaveBeenCalled();
  element('confirm').checked = true;
  element('confirm').dispatchEvent(new window.Event('change'));
  element('send').click();
  await vi.waitFor(() => expect(chrome.cookies.getAll).toHaveBeenCalledOnce());
  expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://*.instagram.com/*'] });
  expect(chrome.cookies.getAll).toHaveBeenCalledWith({ domain: 'instagram.com', storeId: 'profile' });
  expect(window.document.body.textContent).not.toContain('private-source-session');
});

it('keeps closed-station failures actionable and does not send elsewhere', async () => {
  const { chrome, element } = companionPopupFixture();
  await vi.waitFor(() => expect(element('add-download').disabled).toBe(false));
  chrome.permissions.contains.mockResolvedValue(false);
  element('add-download').click();
  await vi.waitFor(() => expect(element('status').textContent).toContain('reconnect'));
  expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
});

it('submits through a paired connection with every station tab closed and never reads source cookies', async () => {
  const { chrome, fetch, element } = companionPopupFixture(true, 'https://www.youtube.com/watch?v=independent', true);
  await vi.waitFor(() => expect(element('add-download').disabled).toBe(false));
  chrome.tabs.query.mockResolvedValue([]);
  element('add-download').click();
  await vi.waitFor(() => expect(element('status').textContent).toContain('Download added'));
  expect(fetch).toHaveBeenCalledWith(
    `${PAIRED_STATION.origin}/api/companion/downloads`,
    expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
  );
  expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  expect(chrome.cookies.getAll).not.toHaveBeenCalled();
  expect(element('mode').textContent).toContain('PAIRED');
});

it('does not reuse a normal-mode connection in an incognito popup', async () => {
  const { chrome, element } = companionPopupFixture(true, 'https://www.youtube.com/watch?v=private', true);
  chrome.tabs.query.mockResolvedValue([{ id: 9, url: 'https://www.youtube.com/watch?v=private', incognito: true }]);
  await vi.waitFor(() => expect(element('download-url').value).toContain('private'));
  expect(element('add-download').disabled).toBe(true);
  expect(element('destination').textContent).not.toBe(PAIRED_STATION.origin);
  expect(element('capture-downloads').disabled).toBe(true);
});

it('asks for download permission only when capture is enabled and saves the paired connection ID', async () => {
  const { chrome, element } = companionPopupFixture(true, 'https://files.example/file', true);
  const capture = element('capture-downloads');
  await vi.waitFor(() => expect(capture.disabled).toBe(false));
  expect(capture.checked).toBe(false);
  expect(chrome.permissions.request).not.toHaveBeenCalled();
  capture.click();
  await vi.waitFor(() => expect(capture.checked).toBe(true));
  expect(chrome.permissions.request).toHaveBeenCalledExactlyOnceWith({ permissions: ['downloads'] });
  expect(chrome.storage.local.set).toHaveBeenCalledExactlyOnceWith({ captureDownloads: PAIRED_STATION.connection.id });
  capture.click();
  await vi.waitFor(() => expect(element('status').textContent).toContain('capture is off'));
  expect(capture.checked).toBe(false);
  expect(chrome.storage.local.remove).toHaveBeenCalledExactlyOnceWith('captureDownloads');
});

it('keeps capture off when the optional download permission is declined', async () => {
  const { chrome, element } = companionPopupFixture(true, 'https://files.example/file', true);
  const capture = element('capture-downloads');
  chrome.permissions.request.mockResolvedValue(false);
  await vi.waitFor(() => expect(capture.disabled).toBe(false));
  capture.click();
  await vi.waitFor(() => expect(element('status').textContent).toContain('permission was declined'));
  expect(capture.checked).toBe(false);
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('shows the last capture result for the current pairing when the popup reopens', async () => {
  const { chrome, element } = companionPopupFixture(true, 'https://files.example/file', true);
  chrome.storage.local.get.mockResolvedValue({
    station: PAIRED_STATION,
    captureDownloads: PAIRED_STATION.connection.id,
  });
  chrome.storage.session.get.mockResolvedValue({
    lastCapture: { connectionId: PAIRED_STATION.connection.id, message: 'The browser copy was kept.' },
  });
  await vi.waitFor(() => expect(element('capture-result').textContent).toBe('The browser copy was kept.'));
  expect(element('capture-result').hidden).toBe(false);
});

it('enables page download buttons by default and saves an opt-out', async () => {
  const { chrome, element } = companionPopupFixture(true, 'https://files.example/video', true);
  const show = element('show-overlays');
  await vi.waitFor(() => expect(show.disabled).toBe(false));
  expect(show.checked).toBe(true);
  expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  show.click();
  await vi.waitFor(() => expect(element('status').textContent).toContain('buttons are off'));
  expect(show.checked).toBe(false);
  expect(chrome.storage.local.set).toHaveBeenCalledExactlyOnceWith({ downloadOverlays: false });
  expect(chrome.permissions.request).not.toHaveBeenCalled();
});

it('declares raster icons, automatic web overlays and capture notifications without the tabs permission', () => {
  const manifest = JSON.parse(readFileSync('browser-connector/manifest.json', 'utf8'));
  expect(manifest.version).toBe('1.5.1');
  expect(manifest.background).toEqual({ service_worker: 'background.js' });
  expect(manifest.optional_permissions).toContain('downloads');
  expect(manifest.permissions).not.toContain('downloads');
  expect(manifest.permissions).not.toContain('tabs');
  expect(manifest.permissions).toContain('notifications');
  expect(manifest.content_scripts).toEqual([{ matches: ['http://*/*', 'https://*/*'], js: ['overlay.js'] }]);
  for (const [size, file] of Object.entries(manifest.icons)) {
    expect(existsSync(`browser-connector/${file}`)).toBe(true);
    const png = readFileSync(`browser-connector/${file}`);
    expect(png.readUInt32BE(PNG_SIZE_OFFSET)).toBe(Number(size));
    expect(png.readUInt32BE(PNG_HEIGHT_OFFSET)).toBe(Number(size));
  }
});
