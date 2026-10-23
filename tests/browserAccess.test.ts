import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { BROWSER_ACCESS, BROWSER_ACTION } from '../shared/browserAccess';
import { SOURCE_TYPE } from '../shared/sources';
import { VIDEO_SITES } from '../shared/videoSites';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import { JOB_OPTIONS } from '../shared/jobOptions';
import { parseCookieJar, cookieHeader } from '../server/browserAccess/cookieJar';
import { browserHeaders, sourceAccess } from '../server/browserAccess/headers';
import { retryAfterSeconds, waitForSource } from '../server/browserAccess/wait';
import { BrowserAccessStore } from '../server/browserAccess/store';
import { prepareMediaCookies } from '../server/engines/cookies';
import { buildMediaArguments } from '../server/engines/mediaArguments';
import { resolveDownloadRequest } from '../server/engines/detectSource';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';

const COOKIE = '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/private\tTRUE\t0\tverified\tprivate-secret\n';
const MASK = 0o777;
const MODE = 0o600;
const SIZE = 1_024;
const DELAY = 2;
afterEach(async () => {
  await cleanupDeliveryFixtures();
  vi.restoreAllMocks();
});

it('validates cookie scope, expiry and unsafe exports', () => {
  const { cookies } = parseCookieJar(COOKIE);
  expect(cookieHeader(cookies, new URL('https://cdn.example.com/private/file'))).toBe('verified=private-secret');
  for (const url of [
    'https://evil-example.com/private',
    'https://example.com/private-other',
    'https://example.com/public',
    'http://example.com/private',
  ]) {
    expect(cookieHeader(cookies, new URL(url))).toBe('');
  }
  expect(cookieHeader([{ ...cookies[0]!, expires: 1 }], new URL('https://example.com/private'))).toBe('');
  for (const value of [
    '{}',
    COOKIE.replace('private-secret', 'injected; header'),
    COOKIE.replace('0\tverified', 'NaN\tverified'),
    COOKIE.replace('verified', 'bad name'),
    COOKIE.replace('private-secret', 'bad\rheader'),
  ]) {
    expect(() => parseCookieJar(value)).toThrow();
  }
  expect(() => parseCookieJar('x'.repeat(BROWSER_ACCESS.maximumCookieBytes + 1))).toThrow('256 KiB');
  const empty = parseCookieJar(COOKIE.replace('private-secret', ''));
  expect(parseCookieJar(empty.text).cookies[0]?.value).toBe('');
});

it('protects session import and keeps credential values out of metadata and history', async () => {
  const { client, login, directory } = await createDeliveryFixture();
  await client.get(BROWSER_ACCESS.path).expect(HTTP_STATUS.unauthorized);
  await client
    .post(BROWSER_ACCESS.path)
    .send({ action: BROWSER_ACTION.import, cookies: COOKIE })
    .expect(HTTP_STATUS.unauthorized);
  await login();
  await client
    .post(BROWSER_ACCESS.path)
    .set('Origin', 'https://other.example')
    .send({ action: BROWSER_ACTION.clear })
    .expect(HTTP_STATUS.forbidden);
  const result = await client
    .post(BROWSER_ACCESS.path)
    .send({ action: BROWSER_ACTION.import, cookies: COOKIE, userAgent: 'Browser/1.0' })
    .expect(HTTP_STATUS.ok);
  expect(result.body).toMatchObject({ hasCookies: true, cookieCount: 1, domainCount: 1, hasUserAgent: true });
  expect(JSON.stringify(result.body)).not.toMatch(/private-secret|Browser\/1.0|verified/);
  expect(readFileSync(path.join(directory, 'history.json'), 'utf8')).not.toContain('private-secret');
  const store = new BrowserAccessStore(directory);
  expect(store.read().cookies).toBe(COOKIE);
  expect(statSync(store.filename).mode & MASK).toBe(MODE);
  const headers = sourceAccess(store.read(), () => undefined);
  expect(browserHeaders(headers, new URL('https://example.com/private/file')).Cookie).toBe('verified=private-secret');
  expect(browserHeaders(headers, new URL('https://other.example/private/file')).Cookie).toBeUndefined();
  await client.get('/credentials/browser-access.json').expect(HTTP_STATUS.notFound);
});

it('rejects injection/pacing errors and removes corrupt session storage', async () => {
  const { client, login, directory } = await createDeliveryFixture();
  await login();
  const store = new BrowserAccessStore(directory);
  for (const body of [
    { action: BROWSER_ACTION.import, cookies: COOKIE, userAgent: 'bad\r\nCookie: secret' },
    { action: BROWSER_ACTION.import, cookies: COOKIE.replace('TRUE', 'MAYBE') },
    { action: BROWSER_ACTION.settings, delaySeconds: -1 },
    { action: BROWSER_ACTION.settings, delaySeconds: '2' },
    { action: 'execute', command: 'anything' },
  ]) {
    await client.post(BROWSER_ACCESS.path).send(body).expect(HTTP_STATUS.badRequest);
    expect(store.snapshot().hasCookies).toBe(false);
  }
  writeFileSync(store.filename, '{ corrupt secret-cookie');
  expect(() => store.read()).toThrow('unreadable');
  await client.post(BROWSER_ACCESS.path).send({ action: BROWSER_ACTION.clear }).expect(HTTP_STATUS.ok);
  expect(store.read().cookies).toBeNull();
});

it('uses private media cookies, mounted fallback and fixed engine arguments', async () => {
  const { client, login, directory, queue } = await createDeliveryFixture();
  await login();
  await client
    .post(BROWSER_ACCESS.path)
    .send({ action: BROWSER_ACTION.settings, delaySeconds: DELAY })
    .expect(HTTP_STATUS.ok);
  await client
    .post(BROWSER_ACCESS.path)
    .send({ action: BROWSER_ACTION.import, cookies: COOKIE, userAgent: 'Browser/1' })
    .expect(HTTP_STATUS.ok);
  const state = new BrowserAccessStore(directory).read();
  const mounted = path.join(directory, 'mounted.txt');
  writeFileSync(mounted, 'mounted-fallback');
  const session = await prepareMediaCookies(directory, mounted, state.cookies);
  expect(readFileSync(session.filename!, 'utf8')).toBe(COOKIE);
  expect(session.filename).not.toContain(queue.store.filesDirectory);
  const job = queue.add('https://example.com/private', SOURCE_TYPE.video);
  const args = buildMediaArguments(job, '/output', 'http://proxy', SIZE, session.filename, 0, state);
  expect(args[args.indexOf('--user-agent') + 1]).toBe('Browser/1');
  expect(args[args.indexOf('--sleep-requests') + 1]).toBe(String(DELAY));
  expect(args.at(-1)).toBe(job.url);
  await session.cleanup();
  expect(existsSync(session.filename!)).toBe(false);
  await client.post(BROWSER_ACCESS.path).send({ action: BROWSER_ACTION.clear }).expect(HTTP_STATUS.ok);
  expect(new BrowserAccessStore(directory).read().delaySeconds).toBe(DELAY);
  const fallback = await prepareMediaCookies(directory, mounted, new BrowserAccessStore(directory).read().cookies);
  expect(readFileSync(fallback.filename!, 'utf8')).toBe('mounted-fallback');
  await fallback.cleanup();
});

it('bounds advertised waits and cancels countdowns', async () => {
  expect(retryAfterSeconds('0')).toBe(0);
  expect(retryAfterSeconds(String(BROWSER_ACCESS.maximumWaitSeconds))).toBe(BROWSER_ACCESS.maximumWaitSeconds);
  expect(retryAfterSeconds(String(BROWSER_ACCESS.maximumWaitSeconds + 1))).toBeNull();
  expect(retryAfterSeconds('not-a-date')).toBeNull();
  const controller = new AbortController();
  const progress = vi.fn();
  const waiting = waitForSource(BROWSER_ACCESS.maximumWaitSeconds, controller.signal, progress);
  const failure = expect(waiting).rejects.toThrow();
  expect(progress).toHaveBeenCalledWith(BROWSER_ACCESS.maximumWaitSeconds);
  controller.abort();
  await failure;
});

it('detects catalogue families without matching hostname lookalikes', () => {
  for (const site of VIDEO_SITES) {
    for (const domain of site.domains) {
      expect(resolveDownloadRequest(`https://${domain}/example`, undefined, undefined).sourceType).toBe(
        SOURCE_TYPE.video,
      );
      expect(resolveDownloadRequest(`https://media.${domain}/example`, undefined, undefined).sourceType).toBe(
        SOURCE_TYPE.video,
      );
    }
  }
  expect(resolveDownloadRequest('https://streamable.com.evil.example/file', undefined, undefined).sourceType).toBe(
    SOURCE_TYPE.direct,
  );
  expect(resolveDownloadRequest('https://another-video.example/watch', SOURCE_TYPE.video, undefined).sourceType).toBe(
    SOURCE_TYPE.video,
  );
});

it('queues a final-link handoff while retaining the original failed job', async () => {
  const { queue, client, login } = await createDeliveryFixture();
  const original = queue.add('https://example.com/countdown');
  original.status = DOWNLOAD_STATUS.failed;
  queue.store.save();
  const endpoint = `${API_PATH.downloads}/${original.id}${JOB_OPTIONS.browserLink}`;
  await client.post(endpoint).send({ url: 'https://cdn.example.com/final.zip' }).expect(HTTP_STATUS.unauthorized);
  await login();
  await client.post(endpoint).send({ url: 'file:///etc/passwd' }).expect(HTTP_STATUS.conflict);
  await client
    .post(endpoint)
    .send({ url: 'https://cdn.example.com/final.zip?token=owned' })
    .expect(HTTP_STATUS.noContent);
  expect(queue.store.jobs[0]?.url).toBe('https://cdn.example.com/final.zip?token=owned');
  expect(queue.store.jobs[0]?.id).not.toBe(original.id);
  expect(original.status).toBe(DOWNLOAD_STATUS.failed);
  expect(original.url).toBe('https://example.com/countdown');
  original.status = DOWNLOAD_STATUS.completed;
  await client.post(endpoint).send({ url: 'https://cdn.example.com/other.zip' }).expect(HTTP_STATUS.conflict);
});
