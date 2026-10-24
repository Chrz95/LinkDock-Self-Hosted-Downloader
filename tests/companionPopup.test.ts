// @vitest-environment jsdom
import { readFileSync, existsSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { closeCompanionPopups, companionPopupFixture, COMPANION_STATION } from './helpers/companionPopupFixture';

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
  expect(chrome.storage.local.set).toHaveBeenCalledWith({ station: COMPANION_STATION });
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

it('declares every raster icon and grants no browsing-history or blanket required host access', () => {
  const manifest = JSON.parse(readFileSync('browser-connector/manifest.json', 'utf8'));
  expect(manifest.version).toBe('1.1.0');
  expect(manifest.permissions).not.toContain('tabs');
  expect(manifest.host_permissions).toBeUndefined();
  for (const [size, file] of Object.entries(manifest.icons)) {
    expect(existsSync(`browser-connector/${file}`)).toBe(true);
    const png = readFileSync(`browser-connector/${file}`);
    expect(png.readUInt32BE(PNG_SIZE_OFFSET)).toBe(Number(size));
    expect(png.readUInt32BE(PNG_HEIGHT_OFFSET)).toBe(Number(size));
  }
});
