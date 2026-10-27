import { expect, it, vi } from 'vitest';
import { loadCompanion } from './helpers/companionFixture';

const TOKEN_LENGTH = 64;
const EXTENSION_ID_LENGTH = 32;
const ORIGIN = 'http://pi:7489';
const SAVED = { origin: ORIGIN, tabId: 1, incognito: false };
const OTHER_TAB = 7;
const TOKEN = `ldc_${'a'.repeat(TOKEN_LENGTH)}`;
const EXTENSION = `chrome-extension://${'a'.repeat(EXTENSION_ID_LENGTH)}`;
const CONNECTION = { id: 'paired-id', expiresAt: '2027-01-25T12:00:00Z' };
/** Creates browser APIs with explicit permissions and station tabs only.
 * @returns {object} Observable station discovery and optional permission boundaries.
 */
function browserFixture() {
  return {
    runtime: { getURL: () => `${EXTENSION}/` },
    permissions: { request: vi.fn().mockResolvedValue(true), contains: vi.fn().mockResolvedValue(true) },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: OTHER_TAB, url: `${ORIGIN}/#library`, incognito: false }]),
      create: vi.fn(),
    },
    storage: {
      local: { set: vi.fn(), get: vi.fn().mockResolvedValue({}), setAccessLevel: vi.fn().mockResolvedValue(undefined) },
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue([{ result: { ok: true, token: TOKEN, connection: CONNECTION } }]),
    },
  };
}

it('pairs the chosen host with restricted download access and no station password', async () => {
  const chrome = browserFixture();
  const connecting = loadCompanion({ chrome }).connectStation(`${ORIGIN}/#settings`, false);
  // Permission is requested before the first awaited browser read, preserving the user gesture.
  expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['http://pi/*'] });
  expect(chrome.tabs.query).not.toHaveBeenCalled();
  expect((await connecting).ok).toBe(true);
  expect(chrome.tabs.query).toHaveBeenCalledWith({ url: 'http://pi/*' });
  expect(chrome.storage.local.set).toHaveBeenCalledWith({
    station: { origin: ORIGIN, tabId: OTHER_TAB, incognito: false, token: TOKEN, connection: CONNECTION },
  });
  expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
    expect.objectContaining({
      target: { tabId: OTHER_TAB },
      world: 'ISOLATED',
      args: [ORIGIN, EXTENSION],
    }),
  );
});

it('rediscovers a reopened station while rejecting wrong ports, origins and incognito contexts', async () => {
  const chrome = browserFixture();
  chrome.tabs.query.mockResolvedValue([
    { id: 1, url: 'http://pi:8080/', incognito: false },
    { id: 1, url: 'http://pi.evil.example:7489/', incognito: false },
    { id: 1, url: `${ORIGIN}/`, incognito: true },
    { id: OTHER_TAB, url: `${ORIGIN}/#settings`, incognito: false },
  ]);
  expect((await loadCompanion({ chrome }).findStationTab(SAVED))?.id).toBe(OTHER_TAB);
  chrome.permissions.contains.mockResolvedValue(false);
  chrome.tabs.query.mockClear();
  expect(await loadCompanion({ chrome }).findStationTab(SAVED)).toBeUndefined();
  expect(chrome.tabs.query).not.toHaveBeenCalled();
});

it('does not save or inspect any tabs after a rejected permission request', async () => {
  const chrome = browserFixture();
  chrome.permissions.request.mockResolvedValue(false);
  expect((await loadCompanion({ chrome }).connectStation(ORIGIN, false)).ok).toBe(false);
  expect(chrome.tabs.query).not.toHaveBeenCalled();
  expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('opens a missing station for sign-in without saving an unverified destination', async () => {
  const chrome = browserFixture();
  chrome.tabs.query.mockResolvedValue([]);
  expect((await loadCompanion({ chrome }).connectStation(ORIGIN, false)).ok).toBe(false);
  expect(chrome.tabs.create).toHaveBeenCalledWith({ url: ORIGIN });
  expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('does not remember a destination whose station identity fails', async () => {
  const chrome = browserFixture();
  chrome.scripting.executeScript.mockResolvedValue([{ result: { ok: false } }]);
  expect((await loadCompanion({ chrome }).connectStation(ORIGIN, false)).ok).toBe(false);
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it.each(['file:///private', 'chrome://settings', 'http://owner:private-password@pi:7489', 'bad address'])(
  'refuses unsafe station addresses without reflecting secrets: %s',
  (address) => {
    const api = loadCompanion();
    expect(() => api.stationOrigin(address)).toThrow('Enter your station');
    try {
      api.stationOrigin(address);
    } catch (error) {
      expect((error as Error).message).not.toContain('private-password');
    }
  },
);
