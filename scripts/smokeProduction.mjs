import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createApplication } from '../dist-server/server/app.js';
import { DownloadQueue } from '../dist-server/server/downloads/queue.js';
import { API_PATH, DOWNLOAD_PATH, HTTP_STATUS } from '../dist-server/shared/contracts.js';
import { ENGINE_STATE, SYSTEM_LIMIT } from '../dist-server/shared/health.js';
import { ENGINE_CHECKS } from '../dist-server/server/health/engines.js';
import { smokeDelivery } from './smokeDelivery.mjs';
import { smokeBulkLibrary } from './smokeBulkLibrary.mjs';
import { smokeOutbox } from './smokeOutbox.mjs';
import { smokeWorkflows } from './smokeWorkflows.mjs';
import { smokeUtilities } from './smokeUtilities.mjs';
import { smokeMediaRecovery } from './smokeMediaRecovery.mjs';
import { smokeCollectionScope } from './smokeCollectionScope.mjs';
import { smokeDeviantart } from './smokeDeviantart.mjs';
import { smokeDeviantartOAuth } from './smokeDeviantartOAuth.mjs';
import { smokeBrowserAccess } from './smokeBrowserAccess.mjs';

/** Native Node execution catches production module interop that the test transformer can mask. */
const SMOKE = { port: 8_080, fileLimit: 1_024, origin: 'https://station.example' };

/**
 * Exercises the compiled application and mobile assets without contacting a download or push provider.
 * @returns {Promise<void>} Native production imports, static assets and private boundaries verified.
 */
async function smokeProduction() {
  const directory = mkdtempSync(path.resolve('tests/.production-'));
  const configuration = {
    dataDirectory: directory,
    port: SMOKE.port,
    accessToken: 'production-smoke-password-at-least-32-characters',
    concurrency: 1,
    maximumFileBytes: SMOKE.fileLimit,
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: true,
  };
  const queue = new DownloadQueue(configuration);
  try {
    await queue.stop();
    const client = request.agent(createApplication(configuration, queue));
    const page = await client.get('/').expect(HTTP_STATUS.ok);
    assert.match(page.text, /manifest.webmanifest/);
    const manifest = await client.get('/manifest.webmanifest').expect(HTTP_STATUS.ok);
    assert.match(manifest.headers['content-type'], /manifest\+json/);
    const parsed = JSON.parse(manifest.text);
    assert.equal(parsed.share_target.method, 'GET');
    assert.equal(parsed.share_target.action, '/');
    const worker = await client.get('/sw.js').expect(HTTP_STATUS.ok);
    assert.match(worker.headers['content-type'], /javascript/);
    for (const asset of ['/offline.html', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']) {
      await client.get(asset).expect(HTTP_STATUS.ok);
    }
    await client.get(API_PATH.notifications).expect(HTTP_STATUS.unauthorized);
    await client.get(API_PATH.station).expect(HTTP_STATUS.unauthorized);
    await client
      .post(`${API_PATH.downloads}${DOWNLOAD_PATH.batch}`)
      .send({ urls: ['https://example.com/a'] })
      .expect(HTTP_STATUS.unauthorized);
    await client.post(API_PATH.session).send({ token: configuration.accessToken }).expect(HTTP_STATUS.noContent);
    const setup = await client.get(API_PATH.notifications).expect(HTTP_STATUS.ok);
    assert.equal(setup.body.enabled, false);
    assert.equal(setup.headers['cache-control'], 'no-store');
    const job = queue.add('https://example.com/library-smoke');
    const metadata = { folder: 'Smoke check', tags: ['Verified'] };
    await client
      .post(`${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.organization}`)
      .send(metadata)
      .expect(HTTP_STATUS.noContent);
    assert.deepEqual(job.library, metadata);
    const health = await client.get(API_PATH.station).expect(HTTP_STATUS.ok);
    assert.equal(health.headers['cache-control'], 'no-store');
    assert.equal(health.body.engines.length, ENGINE_CHECKS.length);
    assert.ok(health.body.engines.every((engine) => Object.values(ENGINE_STATE).includes(engine.state)));
    assert.equal(health.body.runtime.node, process.version);
    assert.ok(health.body.system);
    const { cpuThreads, uptimeSeconds, memory, loadAverage, temperature } = health.body.system;
    for (const value of [cpuThreads, uptimeSeconds, memory.totalBytes, memory.freeBytes]) {
      assert.ok(value === null || (Number.isFinite(value) && value >= 0));
    }
    assert.ok(
      loadAverage === null ||
        (loadAverage.length === SYSTEM_LIMIT.loadWindows &&
          loadAverage.every((value) => Number.isFinite(value) && value >= 0)),
    );
    assert.ok(
      temperature.celsius === null ||
        (temperature.celsius >= SYSTEM_LIMIT.minimumCelsius && temperature.celsius <= SYSTEM_LIMIT.maximumCelsius),
    );
    assert.ok(!JSON.stringify(health.body.system).includes('/sys/'));
    await smokeDelivery(queue, client);
    await smokeBulkLibrary(queue, client, directory);
    await client.get('/notifications/vapid.json').expect(HTTP_STATUS.notFound);
    await smokeOutbox(configuration, queue);
    await smokeWorkflows(configuration);
    await smokeUtilities(configuration);
    await smokeBrowserAccess(configuration, client);
    await smokeDeviantart(configuration, client);
    await smokeDeviantartOAuth(configuration, client);
    await smokeCollectionScope(configuration, client);
    await smokeMediaRecovery(queue, client);
    process.stdout.write('Compiled production imports, mobile assets, organization and private diagnostics: passed.\n');
  } finally {
    await queue.stop();
    rmSync(directory, { recursive: true, force: true });
  }
}

await smokeProduction();
