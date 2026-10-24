import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { API_PATH, HTTP_STATUS } from '../shared/contracts';
import { BROWSER_ACCESS } from '../shared/browserAccess';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';
import { loadCompanion } from './helpers/companionFixture';

const ORIGIN = 'http://pi:7489';
const SECOND_CALL = 2;
afterEach(cleanupDeliveryFixtures);

it.each([
  ['https://www.youtube.com/watch?v=example', 'auto', '1080'],
  ['https://files.example/archive.zip?signature=private-value', 'direct', 'best'],
  ['magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567', 'auto', '1080'],
  ['https://www.youtube.com/watch?v=example', 'video', 'mp3-320'],
])('accepts a reviewed link and options without touching source cookies: %s', (url, sourceType, quality) => {
  const cookies = { getAll: vi.fn() };
  expect(loadCompanion({ chrome: { cookies } }).downloadRequest(` ${url} `, sourceType, quality)).toEqual({
    url,
    sourceType,
    quality,
  });
  expect(cookies.getAll).not.toHaveBeenCalled();
});

it.each([
  'javascript:alert(1)',
  'data:text/html,private-value',
  'file:///etc/passwd',
  'https://owner:private-value@source.example/file',
  '',
  'not a link',
])('rejects unsupported or credential-bearing links before submission: %s', (url) => {
  expect(() => loadCompanion().downloadRequest(url)).toThrow(/Enter /);
});

it('refuses overlong links and forged download options', () => {
  const { downloadRequest } = loadCompanion();
  const excessiveLength = 8_193;
  expect(() => downloadRequest(`https://example.com/${'x'.repeat(excessiveLength)}`)).toThrow('8192');
  expect(() => downloadRequest('https://example.com/file', '--exec')).toThrow('Choose');
  expect(() => downloadRequest('https://example.com/file', 'auto', 'shell-command')).toThrow('Choose');
});

it('requires exact origin and authenticated station identity before posting', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  const api = loadCompanion({ location: { origin: ORIGIN }, fetch });
  expect((await api.submitDownloadToStation('http://pi:8080', {})).ok).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  expect((await api.submitDownloadToStation(ORIGIN, {})).ok).toBe(false);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith(BROWSER_ACCESS.path, expect.objectContaining({ redirect: 'error' }));
});

it('serializes the injected function independently and posts JSON under the station session', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ connector: 'linkdock-browser-access-v1' }) })
    .mockResolvedValueOnce({ status: HTTP_STATUS.created });
  const api = loadCompanion();
  const injected = runInNewContext(`(${api.submitDownloadToStation.toString()})`, {
    location: { origin: ORIGIN },
    fetch,
    AbortSignal,
  }) as typeof api.submitDownloadToStation;
  const payload = api.downloadRequest('https://www.youtube.com/watch?v=example', 'auto', 'mp3-192');
  expect((await injected(ORIGIN, payload)).ok).toBe(true);
  expect(fetch).toHaveBeenNthCalledWith(
    SECOND_CALL,
    API_PATH.downloads,
    expect.objectContaining({
      method: 'POST',
      redirect: 'error',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
});

it('rechecks the station origin after preflight before sending any link', async () => {
  const location = { origin: ORIGIN };
  const fetch = vi.fn().mockImplementation(async () => {
    location.origin = 'https://outside.example';
    return { ok: true, json: async () => ({ connector: 'linkdock-browser-access-v1' }) };
  });
  expect((await loadCompanion({ location, fetch }).submitDownloadToStation(ORIGIN, {})).ok).toBe(false);
  expect(fetch).toHaveBeenCalledOnce();
});

it.each([
  HTTP_STATUS.badRequest,
  HTTP_STATUS.unauthorized,
  HTTP_STATUS.forbidden,
  HTTP_STATUS.tooManyRequests,
  HTTP_STATUS.serverError,
])('returns fixed failure guidance without reflecting raw server data: %s', async (status) => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ connector: 'linkdock-browser-access-v1' }) })
    .mockResolvedValueOnce({ status, json: async () => ({ error: 'private-server-secret' }) });
  const result = await loadCompanion({ location: { origin: ORIGIN }, fetch }).submitDownloadToStation(ORIGIN, {});
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(/private-server-secret/);
  expect(fetch).toHaveBeenCalledTimes(SECOND_CALL);
});

it('does not retry an ambiguous submission and tells the owner to check the queue', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ connector: 'linkdock-browser-access-v1' }) })
    .mockRejectedValueOnce(new Error('private-source-url-with-signature'));
  const result = await loadCompanion({ location: { origin: ORIGIN }, fetch }).submitDownloadToStation(ORIGIN, {});
  expect(result.ok).toBe(false);
  expect(result.message).toContain('before sending again');
  expect(result.message).not.toContain('private-source-url');
  expect(fetch).toHaveBeenCalledTimes(SECOND_CALL);
});

it('queues real video and magnet jobs through the existing authenticated API without a backend change', async () => {
  const { client, login, queue, configuration } = await createDeliveryFixture();
  await login();
  const fetch = vi.fn(async (url: string, options: RequestInit) => {
    const response =
      options.method === 'POST'
        ? await client
            .post(url)
            .set('Origin', ORIGIN)
            .send(JSON.parse(options.body as string))
        : await client.get(url);
    return { ok: response.ok, status: response.status, json: async () => response.body };
  });
  const api = loadCompanion({ fetch, location: { origin: ORIGIN } });
  configuration.publicOrigin = ORIGIN;
  const video = api.downloadRequest('https://www.youtube.com/watch?v=offline-test', 'auto', 'mp3-192');
  expect((await api.submitDownloadToStation(ORIGIN, video)).ok).toBe(true);
  const magnet = api.downloadRequest('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567');
  expect((await api.submitDownloadToStation(ORIGIN, magnet)).ok).toBe(true);
  expect(queue.store.jobs).toHaveLength(SECOND_CALL);
  expect(queue.store.jobs.find((job) => job.sourceType === 'video')?.quality).toBe('mp3-192');
  expect(queue.store.jobs.some((job) => job.sourceType === 'magnet')).toBe(true);
});
