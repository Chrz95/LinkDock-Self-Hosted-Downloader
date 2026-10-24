import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { BROWSER_ACCESS } from '../shared/browserAccess';
import { HTTP_STATUS } from '../shared/contracts';
import { BrowserAccessStore } from '../server/browserAccess/store';
import { cookiesForSource, sessionUserAgent } from '../server/browserAccess/sessions';
import { parseCookieJar } from '../server/browserAccess/cookieJar';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';

const TWO_SESSIONS = 2;
const INSTAGRAM = '# Netscape HTTP Cookie File\n.instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\tinstagram-secret\n';
const DEVIANTART = '# Netscape HTTP Cookie File\n.deviantart.com\tTRUE\t/\tTRUE\t0\tauth\tdeviantart-secret\n';
afterEach(cleanupDeliveryFixtures);

it('preserves legacy sessions through multi-site imports, refresh, reload and individual removal', async () => {
  const { client, login, directory } = await createDeliveryFixture();
  await login();
  const store = new BrowserAccessStore(directory);
  writeFileSync(
    store.filename,
    JSON.stringify({
      cookies: DEVIANTART,
      userAgent: 'OldBrowser',
      delaySeconds: 0,
      updatedAt: null,
    }),
  );
  const result = await client
    .post(BROWSER_ACCESS.path)
    .send({
      action: 'import',
      cookies: INSTAGRAM,
      userAgent: 'InstagramBrowser',
    })
    .expect(HTTP_STATUS.ok);
  expect(result.body.sessions.map((entry: { domain: string }) => entry.domain)).toEqual([
    'deviantart.com',
    'instagram.com',
  ]);
  expect(JSON.stringify(result.body)).not.toMatch(/secret|OldBrowser|InstagramBrowser/);
  expect(sessionUserAgent(store.read(), 'https://www.deviantart.com/art/1')).toBe('OldBrowser');
  expect(sessionUserAgent(store.read(), 'https://www.instagram.com/p/1')).toBe('InstagramBrowser');
  await client
    .post(BROWSER_ACCESS.path)
    .send({ action: 'import', cookies: INSTAGRAM.replace('instagram-secret', 'new') })
    .expect(HTTP_STATUS.ok);
  const reloaded = new BrowserAccessStore(directory);
  expect(reloaded.read().cookies).toContain('deviantart-secret');
  expect(cookiesForSource(reloaded.read(), 'https://www.instagram.com/p/1')).not.toContain('deviantart-secret');
  expect(cookiesForSource(reloaded.read(), 'https://instagram.com.evil.test/')).toBeNull();
  expect(cookiesForSource(reloaded.read(), 'https://youtube.com/watch')).toBeNull();
  expect(reloaded.read().cookies).not.toContain('instagram-secret');
  expect(parseCookieJar(reloaded.read().cookies).cookies).toHaveLength(TWO_SESSIONS);
  await client.post(BROWSER_ACCESS.path).send({ action: 'remove', domain: 'instagram.com' }).expect(HTTP_STATUS.ok);
  expect(reloaded.read().cookies).toBe(DEVIANTART);
  expect(sessionUserAgent(reloaded.read(), 'https://www.deviantart.com/art/1')).toBe('OldBrowser');
  await client
    .post(BROWSER_ACCESS.path)
    .send({ action: 'remove', domain: 'instagram.com' })
    .expect(HTTP_STATUS.badRequest);
  expect(reloaded.read().cookies).toBe(DEVIANTART);
});

it('refreshes subdomain credentials without changing other sites', async () => {
  const { client, login, directory } = await createDeliveryFixture();
  await login();
  await client
    .post(BROWSER_ACCESS.path)
    .send({ action: 'import', cookies: `${DEVIANTART}.www.instagram.com\tTRUE\t/\tTRUE\t0\tstale\told-secret\n` })
    .expect(HTTP_STATUS.ok);
  await client.post(BROWSER_ACCESS.path).send({ action: 'import', cookies: INSTAGRAM }).expect(HTTP_STATUS.ok);
  const store = new BrowserAccessStore(directory);
  expect(store.read().cookies).not.toContain('old-secret');
  const before = readFileSync(store.filename, 'utf8');
  await client.post(BROWSER_ACCESS.path).send({ action: 'import', cookies: 'invalid' }).expect(HTTP_STATUS.badRequest);
  expect(readFileSync(store.filename, 'utf8')).toBe(before);
  await client.post(BROWSER_ACCESS.path).send({ action: 'clear' }).expect(HTTP_STATUS.ok);
  expect(store.snapshot().sessions).toEqual([]);
  expect(store.read().userAgents).toEqual({});
});

/** Loads the exact shipped companion script in an isolated mocked browser context.
 * @param {Record<string, unknown>} globals - Minimal browser APIs.
 * @returns {object} Callable script functions.
 */
function companion(globals: Record<string, unknown> = {}) {
  return runInNewContext(
    `${readFileSync('browser-connector/transfer.js', 'utf8')}; ({sessionExport, sendToStation});`,
    {
      AbortSignal,
      ...globals,
    },
  ) as {
    sessionExport: (cookies: object[], domain: string) => string;
    sendToStation: (origin: string, cookies: string, userAgent: string) => Promise<{ ok: boolean; message: string }>;
  };
}

it('companion reads only the chosen site, preserves HttpOnly and rejects missing Instagram login', () => {
  const { sessionExport } = companion();
  const cookie = {
    domain: '.instagram.com',
    path: '/',
    secure: true,
    httpOnly: true,
    hostOnly: false,
    name: 'sessionid',
    value: 'private-session',
  };
  const result = sessionExport(
    [
      cookie,
      { ...cookie, domain: '.deviantart.com' },
      { ...cookie, domain: '.instagram.com.evil.test' },
      { ...cookie, partitionKey: {} },
    ],
    'instagram.com',
  );
  expect(result).toContain('#HttpOnly_.instagram.com');
  expect(parseCookieJar(result).cookies).toHaveLength(1);
  expect(() => sessionExport([{ ...cookie, name: 'other' }], 'instagram.com')).toThrow('login session');
  expect(() => sessionExport([cookie], 'evil.test')).toThrow('Unsupported');
});

it('companion requires station identity and unchanged origin, sends private JSON and returns no secrets', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ connector: 'linkdock-browser-access-v1' }) })
    .mockResolvedValueOnce({ ok: true });
  const { sendToStation } = companion({ fetch, location: { origin: 'http://pi:7489' } });
  expect((await sendToStation('http://evil.test', INSTAGRAM, 'Browser')).ok).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  const result = await sendToStation('http://pi:7489', INSTAGRAM, 'Browser');
  expect(result.ok).toBe(true);
  expect(JSON.stringify(result)).not.toContain('instagram-secret');
  const [, options] = fetch.mock.calls[1]!;
  expect(options).toMatchObject({ method: 'POST', credentials: 'same-origin', redirect: 'error' });
  expect(JSON.parse(options.body)).toEqual({ action: 'import', cookies: INSTAGRAM, userAgent: 'Browser' });
  fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  expect((await sendToStation('http://pi:7489', INSTAGRAM, 'Browser')).ok).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('companion reads only the selected session after permission and resolves the current station tab', async () => {
  const destination = { id: 1, url: 'http://pi:7489/', incognito: false };
  const chrome = {
    permissions: { request: vi.fn().mockResolvedValue(false) },
    cookies: {
      getAll: vi.fn().mockResolvedValue([]),
      getAllCookieStores: vi.fn().mockResolvedValue([{ id: 'profile', tabIds: [1] }]),
    },
    scripting: { executeScript: vi.fn().mockResolvedValue([{ result: { ok: true, message: 'Saved' } }]) },
  };
  const findStationTab = vi.fn().mockResolvedValue(destination);
  const api = companion();
  const { sendSelectedSession } = runInNewContext(
    `${readFileSync('browser-connector/session.js', 'utf8')}; ({sendSelectedSession});`,
    {
      chrome,
      navigator: { userAgent: 'MatchingBrowser' },
      LinkDockCompanion: { ...api, findStationTab, sessionExport: () => DEVIANTART },
    },
  ) as { sendSelectedSession: (station: object, domain: string) => Promise<{ ok: boolean }> };
  const station = { origin: 'http://pi:7489', tabId: 1 };
  expect(chrome.cookies.getAll).not.toHaveBeenCalled();
  await expect(sendSelectedSession(station, 'deviantart.com')).rejects.toThrow('Source permission');
  expect(findStationTab).not.toHaveBeenCalled();
  expect(chrome.cookies.getAll).not.toHaveBeenCalled();
  chrome.permissions.request.mockResolvedValue(true);
  expect((await sendSelectedSession(station, 'deviantart.com')).ok).toBe(true);
  expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://*.deviantart.com/*'] });
  expect(chrome.cookies.getAll).toHaveBeenCalledWith({ domain: 'deviantart.com', storeId: 'profile' });
  expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
    expect.objectContaining({
      target: { tabId: 1 },
      world: 'ISOLATED',
      args: ['http://pi:7489', DEVIANTART, 'MatchingBrowser'],
    }),
  );
  findStationTab.mockResolvedValue(undefined);
  chrome.cookies.getAll.mockClear();
  await expect(sendSelectedSession(station, 'instagram.com')).rejects.toThrow('Open your station');
  expect(chrome.cookies.getAll).not.toHaveBeenCalled();
});
