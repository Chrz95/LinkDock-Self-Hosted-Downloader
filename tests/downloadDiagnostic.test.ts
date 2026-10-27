import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createDeliveryFixture, cleanupDeliveryFixtures } from './helpers/deliveryFixture';
import { inspectPage } from '../server/diagnostics/page';
import { inspectDownloadEngine } from '../server/diagnostics/engine';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import { SOURCE_TYPE } from '../shared/sources';
import { BrowserAccessStore } from '../server/browserAccess/store';
import { DIAGNOSTICS } from '../shared/diagnostics';
import { inspectSession } from '../server/diagnostics/session';

vi.mock('../server/diagnostics/page', () => ({ inspectPage: vi.fn() }));
vi.mock('../server/diagnostics/engine', () => ({ inspectDownloadEngine: vi.fn() }));
afterEach(async () => {
  await cleanupDeliveryFixtures();
  vi.mocked(inspectPage).mockReset();
  vi.mocked(inspectDownloadEngine).mockReset();
});

it('requires the station session and rejects foreign origins, missing jobs and nonfailed jobs', async () => {
  const fixture = await createDeliveryFixture();
  const job = fixture.createFile('Sample', Buffer.from('file'));
  const endpoint = `${API_PATH.downloads}/${job.id}${DIAGNOSTICS.path}`;
  await request(fixture.application).post(endpoint).send({}).expect(HTTP_STATUS.unauthorized);
  await fixture.login();
  await fixture.client.post(endpoint).set('Origin', 'https://foreign.example').send({}).expect(HTTP_STATUS.forbidden);
  await fixture.client.post(endpoint).send({}).expect(HTTP_STATUS.conflict);
  await fixture.client.post(`${API_PATH.downloads}/missing${DIAGNOSTICS.path}`).send({}).expect(HTTP_STATUS.notFound);
  job.status = DOWNLOAD_STATUS.failed;
  job.sourceType = SOURCE_TYPE.magnet;
  await fixture.client.post(endpoint).send({}).expect(HTTP_STATUS.conflict);
  expect(inspectPage).not.toHaveBeenCalled();
});

it('exports only safe fields, preserves history and credentials and caches repeated probes', async () => {
  const fixture = await createDeliveryFixture();
  const job = fixture.createFile('Private filename', Buffer.from('bytes'));
  job.status = DOWNLOAD_STATUS.failed;
  job.url = 'https://source.example/file?token=private-source';
  const browser = new BrowserAccessStore(fixture.directory);
  browser.save({
    cookies: '# Netscape HTTP Cookie File\nsource.example\tFALSE\t/\tTRUE\t0\tauth\tprivate-cookie\n',
    userAgent: 'Private browser/1',
    delaySeconds: 0,
    updatedAt: null,
  });
  const originalSession = readFileSync(browser.filename, 'utf8');
  const originalJob = JSON.stringify(job);
  vi.mocked(inspectPage).mockResolvedValue([
    { id: 'source', label: 'Source response', state: 'passed', detail: 'HTTP 200.' },
  ]);
  vi.mocked(inspectDownloadEngine).mockResolvedValue([]);
  await fixture.login();
  const endpoint = `${API_PATH.downloads}/${job.id}${DIAGNOSTICS.path}`;
  const first = await fixture.client.post(endpoint).send({ url: 'http://127.0.0.1/ignored' }).expect(HTTP_STATUS.ok);
  expect(first.headers['cache-control']).toBe('no-store');
  expect(first.body).toMatchObject({ diagnostic: 'LD-DOWNLOAD-1', dnsMode: 'system', sourceType: 'direct' });
  expect(first.body.checks).toContainEqual(expect.objectContaining({ id: 'session', state: 'info' }));
  expect(first.text).not.toMatch(/private-|source\.example|Private browser|Private filename/);
  expect(first.text).not.toContain(fixture.directory);
  expect(inspectPage).toHaveBeenCalledWith(
    job.url,
    fixture.configuration,
    false,
    expect.objectContaining({ cookies: expect.any(Array) }),
    expect.any(AbortSignal),
  );
  const second = await fixture.client.post(endpoint).send({}).expect(HTTP_STATUS.ok);
  expect(second.body).toEqual(first.body);
  expect(inspectPage).toHaveBeenCalledOnce();
  expect(JSON.stringify(job)).toBe(originalJob);
  expect(readFileSync(browser.filename, 'utf8')).toBe(originalSession);
});

it('serializes checks across the station and expires the one-minute result cache', async () => {
  const fixture = await createDeliveryFixture();
  const first = fixture.createFile('First', Buffer.from('file'));
  const second = fixture.createFile('Second', Buffer.from('file'));
  first.status = second.status = DOWNLOAD_STATUS.failed;
  vi.mocked(inspectDownloadEngine).mockResolvedValue([]);
  let finish: ((checks: Awaited<ReturnType<typeof inspectPage>>) => void) | undefined;
  const pending = new Promise<Awaited<ReturnType<typeof inspectPage>>>((resolve) => {
    finish = resolve;
  });
  vi.mocked(inspectPage).mockReturnValueOnce(pending).mockResolvedValue([]);
  await fixture.login();
  const endpoint = `${API_PATH.downloads}/${first.id}${DIAGNOSTICS.path}`;
  const initial = fixture.client
    .post(endpoint)
    .send({})
    .then((response) => response);
  await vi.waitFor(() => expect(inspectPage).toHaveBeenCalledOnce());
  await fixture.client
    .post(`${API_PATH.downloads}/${second.id}${DIAGNOSTICS.path}`)
    .send({})
    .expect(HTTP_STATUS.conflict);
  finish!([]);
  expect((await initial).status).toBe(HTTP_STATUS.ok);
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + DIAGNOSTICS.cacheMilliseconds + 1);
  await fixture.client.post(endpoint).send({}).expect(HTTP_STATUS.ok);
  const expectedChecks = 2;
  expect(inspectPage).toHaveBeenCalledTimes(expectedChecks);
});

it('marks expired matching cookies as absent and never considers unrelated cookies account verification', async () => {
  const fixture = await createDeliveryFixture();
  const job = fixture.createFile('Example', Buffer.from('file'));
  job.url = 'https://source.example/file';
  const browser = new BrowserAccessStore(fixture.directory);
  browser.save({
    cookies:
      '# Netscape HTTP Cookie File\n' +
      'source.example\tFALSE\t/\tTRUE\t1\texpired\tsecret\n' +
      'other.example\tFALSE\t/\tTRUE\t0\tother\tsecret\n',
    userAgent: '',
    delaySeconds: 0,
    updatedAt: null,
  });
  const result = inspectSession(job, fixture.configuration);
  expect(result.check.state).toBe('info');
  expect(result.check.detail).toContain('No matching unexpired');
  expect(result.check.detail).toContain('not tested');
});
