import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { loadCompanion } from './helpers/companionFixture';
import { HTTP_STATUS } from '../shared/contracts';

const TOKEN_LENGTH = 64;
const EXTENSION_LENGTH = 32;
const extension = `chrome-extension://${'a'.repeat(EXTENSION_LENGTH)}`;
const station = { origin: 'https://station.example:7489', token: `ldc_${'a'.repeat(TOKEN_LENGTH)}`, incognito: false };
/** Models extension-only network access with no cookies or open station tabs.
 * @returns {object} Observable extension API boundaries and private bearer request transport.
 */
function browser() {
  return {
    runtime: { getURL: () => `${extension}/` },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
    storage: { local: { remove: vi.fn().mockResolvedValue(undefined) } },
    scripting: { executeScript: vi.fn() },
    cookies: { getAll: vi.fn() },
    tabs: { query: vi.fn() },
  };
}

it('queues directly to the exact saved station without cookies, redirects or an open station tab', async () => {
  const chrome = browser();
  const fetch = vi.fn().mockResolvedValue({ status: HTTP_STATUS.created });
  const api = loadCompanion({ chrome, fetch });
  const payload = api.downloadRequest('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567');
  const result = await api.pairedRequest(station, 'downloads', payload);
  expect(result.ok).toBe(true);
  expect(fetch).toHaveBeenCalledWith(
    `${station.origin}/api/companion/downloads`,
    expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${station.token}`,
        'X-LinkDock-Extension': extension,
        'Content-Type': 'application/json',
      },
    }),
  );
  expect(chrome.tabs.query).not.toHaveBeenCalled();
  expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  expect(chrome.cookies.getAll).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain(station.token);
});

it('refuses removed host permissions and unsupported actions before sending a credential', async () => {
  const chrome = browser();
  const fetch = vi.fn();
  chrome.permissions.contains.mockResolvedValue(false);
  const api = loadCompanion({ chrome, fetch });
  expect((await api.pairedRequest(station, 'downloads', {})).ok).toBe(false);
  chrome.permissions.contains.mockResolvedValue(true);
  expect((await api.pairedRequest(station, 'library')).ok).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it('does not retry an ambiguous submission or reflect server errors, source links or tokens', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error(`private-source ${station.token}`))
    .mockResolvedValueOnce({ status: HTTP_STATUS.unauthorized, json: () => ({ error: 'private-server-secret' }) });
  const api = loadCompanion({ chrome: browser(), fetch });
  const ambiguous = await api.pairedRequest(station, 'downloads', {});
  expect(ambiguous.message).toContain('before sending again');
  expect(fetch).toHaveBeenCalledOnce();
  const revoked = await api.pairedRequest(station, 'downloads', {});
  expect(revoked.message).toContain('revoked');
  expect(JSON.stringify([ambiguous, revoked])).not.toMatch(/private-|ldc_/);
});

it('forgets locally while explaining that an offline station still needs manual revocation', async () => {
  const chrome = browser();
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  const result = await loadCompanion({ chrome, fetch }).forgetStation(station);
  expect(chrome.storage.local.remove).toHaveBeenCalledWith('station');
  expect(result.ok).toBe(false);
  expect(result.message).toContain('Revoke its connection in LinkDock Settings');
});

it('pairs through an independently serialized function in the signed-in station', async () => {
  const connection = { id: 'connection-id', expiresAt: '2027-01-25T12:00:00Z' };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ connector: 'linkdock-browser-access-v1' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: station.token, connection }) });
  const api = loadCompanion();
  const injected = runInNewContext(`(${api.identifyStation.toString()})`, {
    location: { origin: station.origin },
    fetch,
    AbortSignal,
  }) as (origin: string, extensionOrigin: string) => Promise<object>;
  expect(await injected(station.origin, extension)).toEqual({ ok: true, token: station.token, connection });
  expect(fetch).toHaveBeenLastCalledWith(
    '/api/companions',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      body: JSON.stringify({ extensionOrigin: extension }),
    }),
  );
});
