import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApplication } from '../server/app';
import { DownloadQueue } from '../server/downloads/queue';
import { API_PATH, DOWNLOAD_PATH, DOWNLOAD_STATUS, HTTP_STATUS, JOB_ACTION } from '../shared/contracts';
import { JOB_PRIORITY } from '../shared/batch';
import { NOTIFICATION_PATH } from '../shared/notifications';
import type { ServerConfig } from '../server/config';
import { DEFAULT_POLICY } from '../shared/policy';
import { EngineInspector } from '../server/health/engines';

const SERVICE_PORT = 8_080;
const FILE_LIMIT_BYTES = 1_024;
const cleanups: (() => void)[] = [];

/**
 * Creates a service and browser-cookie client on isolated temporary storage.
 * @returns {object} Test app, authenticated client and token.
 */
function createTestService() {
  const directory = mkdtempSync(path.resolve('tests/.http-'));
  const configuration: ServerConfig = {
    port: SERVICE_PORT,
    dataDirectory: directory,
    accessToken: 'test-station-password-at-least-32-characters',
    concurrency: 1,
    maximumFileBytes: FILE_LIMIT_BYTES,
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
  const queue = new DownloadQueue(configuration);
  const application = createApplication(configuration, queue);
  cleanups.push(
    /**
     * Prepares or cleans an isolated dependency for this regression test.
     */
    () => {
      queue.stop();
      rmSync(directory, { recursive: true, force: true });
    },
  );
  return { queue, application, client: request.agent(application), token: configuration.accessToken };
}
afterEach(
  /**
   * Cleans isolated test resources after the case finishes.
   */
  () => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  },
);

/**
 * Groups behavior checks: authenticated HTTP boundary.
 */
describe('authenticated HTTP boundary', () => {
  /** Verifies private organization replacement and invalid-edit atomicity. @returns {Promise<void>} API verified. */
  it('protects labels and persists only a valid complete organization edit', async () => {
    const { client, queue, token } = createTestService();
    await queue.stop();
    const job = queue.add('https://example.com/library.zip');
    const endpoint = `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.organization}`;
    const metadata = { folder: 'Research', tags: ['Useful'] };
    await client.post(endpoint).send(metadata).expect(HTTP_STATUS.unauthorized);
    await client.post(API_PATH.session).send({ token }).expect(HTTP_STATUS.noContent);
    await client.post(endpoint).set('Origin', 'https://attacker.example').send(metadata).expect(HTTP_STATUS.forbidden);
    await client.post(endpoint).send(metadata).expect(HTTP_STATUS.noContent);
    await client
      .post(endpoint)
      .send({ folder: 'Changed', tags: ['bad/tag'] })
      .expect(HTTP_STATUS.badRequest);
    expect(job.library).toEqual(metadata);
    const snapshot = await client.get(API_PATH.downloads).expect(HTTP_STATUS.ok);
    expect(snapshot.body.jobs[0].library).toEqual(metadata);
  });
  /** Checks diagnostics stay private and survive a storage-read failure. @returns {Promise<void>} API verified. */
  it('keeps detailed health behind authentication while preserving the minimal public probe', async () => {
    const inspect = vi.spyOn(EngineInspector.prototype, 'inspect').mockResolvedValue([]);
    const { client, queue, token } = createTestService();
    const probe = await client.get(API_PATH.health).expect(HTTP_STATUS.ok);
    expect(probe.body).toEqual({ status: 'ok' });
    await client.get(API_PATH.station).expect(HTTP_STATUS.unauthorized);
    expect(inspect).not.toHaveBeenCalled();
    await client.post(API_PATH.session).send({ token }).expect(HTTP_STATUS.noContent);
    const health = await client.get(API_PATH.station).expect(HTTP_STATUS.ok);
    expect(health.headers['cache-control']).toBe('no-store');
    expect(health.body.runtime.node).toBe(process.version);
    expect(health.body.storage.availableBytes).toBeGreaterThan(0);
    expect(JSON.stringify(health.body)).not.toContain(token);
    expect(JSON.stringify(health.body)).not.toContain(queue.store.filesDirectory);
    vi.spyOn(queue, 'snapshot').mockImplementationOnce(() => {
      throw new Error('Private mount detail');
    });
    vi.spyOn(process, 'memoryUsage').mockImplementationOnce(() => {
      throw new Error('Memory unavailable');
    });
    const unavailable = await client.get(API_PATH.station).expect(HTTP_STATUS.ok);
    expect(unavailable.body.runtime.memoryBytes).toBeNull();
    expect(unavailable.body.storage).toMatchObject({ writable: false, availableBytes: null });
    expect(unavailable.body.storage.detail).toContain('Check the data mount');
    expect(JSON.stringify(unavailable.body)).not.toContain('Private mount detail');
  });
  /** Tests batch review, priority persistence and failure atomicity. @returns {Promise<void>} API checks complete. */
  it('protects batch operations and priority changes and validates all links before committing', async () => {
    const { client, queue, token } = createTestService();
    await queue.stop();
    const previewPath = `${API_PATH.downloads}${DOWNLOAD_PATH.batchPreview}`;
    const batchPath = `${API_PATH.downloads}${DOWNLOAD_PATH.batch}`;
    const urls = ['https://example.com/first', 'https://example.com/second'];
    await client.post(batchPath).send({ urls }).expect(HTTP_STATUS.unauthorized);
    await client.post(API_PATH.session).send({ token }).expect(HTTP_STATUS.noContent);
    await client.post(previewPath).send({ urls }).expect(HTTP_STATUS.ok);
    expect(queue.store.jobs).toHaveLength(0);
    await client
      .post(batchPath)
      .send({ urls: [...urls, 'file:///private'] })
      .expect(HTTP_STATUS.badRequest);
    expect(queue.store.jobs).toHaveLength(0);
    await client.post(batchPath).set('Origin', 'https://attacker.example').send({ urls }).expect(HTTP_STATUS.forbidden);
    await client.post(batchPath).send({ urls }).expect(HTTP_STATUS.created);
    const job = queue.store.jobs[0]!;
    const priorityPath = `${API_PATH.downloads}/${job.id}/${JOB_ACTION.priorityHigh}`;
    await client.post(priorityPath).send({}).expect(HTTP_STATUS.noContent);
    expect(job.priority).toBe(JOB_PRIORITY.high);
    job.status = DOWNLOAD_STATUS.completed;
    await client.post(priorityPath).send({}).expect(HTTP_STATUS.conflict);
  });
  /** Checks notification authentication and CSRF. @returns {Promise<void>} Protected API checks complete. */
  it('protects notification setup, registration, status and tests with session and origin boundaries', async () => {
    const { client, token } = createTestService();
    await client.get(API_PATH.notifications).expect(HTTP_STATUS.unauthorized);
    await client
      .post(`${API_PATH.notifications}${NOTIFICATION_PATH.subscription}`)
      .send({})
      .expect(HTTP_STATUS.unauthorized);
    await client.post(API_PATH.session).send({ token }).expect(HTTP_STATUS.noContent);
    const setup = await client.get(API_PATH.notifications).expect(HTTP_STATUS.ok);
    expect(setup.body).toMatchObject({ enabled: false, publicKey: null });
    expect(setup.headers['cache-control']).toBe('no-store');
    const status = await client
      .post(`${API_PATH.notifications}${NOTIFICATION_PATH.status}`)
      .send({ endpoint: 'fake' })
      .expect(HTTP_STATUS.ok);
    expect(status.body).toEqual({ subscribed: false });
    await client
      .post(`${API_PATH.notifications}${NOTIFICATION_PATH.test}`)
      .send({ endpoint: 'fake' })
      .expect(HTTP_STATUS.badRequest);
    await client
      .post(`${API_PATH.notifications}${NOTIFICATION_PATH.unsubscribe}`)
      .set('Origin', 'https://attacker.example')
      .send({ endpoint: 'fake' })
      .expect(HTTP_STATUS.forbidden);
  });
  /**
   * Checks settings inherit session, origin and validation boundaries and expose durable state.
   * @returns {Promise<void>} Authenticated settings round trip.
   */
  it('protects station preferences and preserves the previous policy after invalid requests', async () => {
    const { client, token } = createTestService();
    await client.get(API_PATH.settings).expect(HTTP_STATUS.unauthorized);
    await client.post(API_PATH.settings).send(DEFAULT_POLICY).expect(HTTP_STATUS.unauthorized);
    await client.post(API_PATH.session).send({ token }).expect(HTTP_STATUS.noContent);
    const next = { ...DEFAULT_POLICY, downloadKibPerSecond: 1 };
    await client.post(API_PATH.settings).send(next).expect(HTTP_STATUS.ok);
    await client
      .post(API_PATH.settings)
      .send({ ...next, reserveGib: -1 })
      .expect(HTTP_STATUS.badRequest);
    const saved = await client.get(API_PATH.settings).expect(HTTP_STATUS.ok);
    expect(saved.body).toEqual(next);
    expect(saved.headers['cache-control']).toBe('no-store');
    await client
      .post(API_PATH.settings)
      .set('Origin', 'https://attacker.example')
      .send(DEFAULT_POLICY)
      .expect(HTTP_STATUS.forbidden);
  });
  /**
   * Verifies: serves completed bytes as an authenticated attachment with the original display name.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('serves completed bytes as an authenticated attachment with the original display name', async () => {
    const { client, queue, token } = createTestService();
    queue.stop();
    const job = queue.add('https://example.com/archive.zip');
    job.status = DOWNLOAD_STATUS.completed;
    writeFileSync(queue.store.getFilePath(job.id), 'complete bytes');
    await client.post(API_PATH.session).send({ token }).expect(HTTP_STATUS.noContent);
    const download = await client.get(`${API_PATH.downloads}/${job.id}/file`).expect(HTTP_STATUS.ok);
    expect(download.headers['content-disposition']).toMatch(/attachment; filename="?archive\.zip"?/);
    expect(download.headers['content-type']).toContain('application/octet-stream');
    expect(download.body.toString()).toBe('complete bytes');
  });

  /**
   * Verifies: allows health probes but refuses an unauthenticated queue.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('allows health probes but refuses an unauthenticated queue', async () => {
    const { application } = createTestService();
    await request(application).get(API_PATH.health).expect(HTTP_STATUS.ok);
    await request(application).get(API_PATH.downloads).expect(HTTP_STATUS.unauthorized);
    await request(application).get(`${API_PATH.downloads}/missing/file`).expect(HTTP_STATUS.unauthorized);
  });
  /**
   * Verifies: sets a protected cookie, reads state, rejects bad links and clears the cookie on logout.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('sets a protected cookie, reads state, rejects bad links and clears the cookie on logout', async () => {
    const { client, token } = createTestService();
    const login = await client.post(API_PATH.session).send({ token }).expect(HTTP_STATUS.noContent);
    expect(String(login.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(login.headers['set-cookie'])).toContain('SameSite=Strict');
    const snapshot = await client.get(API_PATH.downloads).expect(HTTP_STATUS.ok);
    expect(snapshot.body.jobs).toEqual([]);
    await client.post(API_PATH.downloads).send({ url: 'file:///etc/passwd' }).expect(HTTP_STATUS.badRequest);
    await client.delete(API_PATH.session).send({}).expect(HTTP_STATUS.noContent);
    await client.get(API_PATH.downloads).expect(HTTP_STATUS.unauthorized);
  });
  /**
   * Verifies: rejects incorrect credentials and cross-origin mutation requests.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('rejects incorrect credentials and cross-origin mutation requests', async () => {
    const { client, token } = createTestService();
    await client.post(API_PATH.session).send({ token: 'wrong' }).expect(HTTP_STATUS.unauthorized);
    await client
      .post(API_PATH.session)
      .set('Origin', 'https://attacker.example')
      .send({ token })
      .expect(HTTP_STATUS.forbidden);
    await client.post(API_PATH.session).type('form').send({ token }).expect(HTTP_STATUS.forbidden);
  });
  /**
   * Verifies: rejects forged cookies and does not expose arbitrary filesystem paths.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('rejects forged cookies and does not expose arbitrary filesystem paths', async () => {
    const { client, token } = createTestService();
    await client
      .get(API_PATH.downloads)
      .set('Cookie', 'linkdock_session=9999999999999.forged')
      .expect(HTTP_STATUS.unauthorized);
    await client.post(API_PATH.session).send({ token }).expect(HTTP_STATUS.noContent);
    await client.get(`${API_PATH.downloads}/etc-passwd/file`).expect(HTTP_STATUS.notFound);
  });
});
