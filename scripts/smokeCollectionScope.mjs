import assert from 'node:assert/strict';
import { DEVIANTART, DEVIANTART_ACTION } from '../dist-server/shared/deviantart.js';
import { API_PATH, DOWNLOAD_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../dist-server/shared/contracts.js';
import { DownloadStore } from '../dist-server/server/downloads/store.js';

/**
 * Checks compiled single-job pinning, representation-aware duplicate review and durable restart behavior.
 * @param {object} configuration - Temporary production station configuration.
 * @param {object} client - Authenticated owner API agent.
 * @returns {Promise<void>} Source snapshots remain independent of later station preferences.
 */
export async function smokeCollectionScope(configuration, client) {
  const url = 'https://www.deviantart.com/compiled-scope';
  const first = await client.post(API_PATH.downloads).send({ url }).expect(HTTP_STATUS.created);
  const savedScope = first.body.deviantart;
  assert.ok(savedScope.include.includes('gallery'));
  const changed = { include: ['scraps'], original: false, stories: 'none' };
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.preferences, ...changed })
    .expect(HTTP_STATUS.ok);
  const review = await client
    .post(`${API_PATH.downloads}${DOWNLOAD_PATH.batchPreview}`)
    .send({ urls: [url, url] })
    .expect(HTTP_STATUS.ok);
  assert.equal(review.body.newCount, 1);
  assert.deepEqual(review.body.duplicates, [url]);
  const second = await client.post(API_PATH.downloads).send({ url }).expect(HTTP_STATUS.created);
  assert.deepEqual(second.body.deviantart, changed);
  await client.post(`${API_PATH.downloads}/${first.body.id}/pause`).send({}).expect(HTTP_STATUS.noContent);
  await client.post(`${API_PATH.downloads}/${first.body.id}/retry`).send({}).expect(HTTP_STATUS.noContent);
  const history = new DownloadStore(configuration.dataDirectory).jobs;
  const original = history.find((job) => job.id === first.body.id);
  assert.deepEqual(original.deviantart, savedScope);
  assert.equal(original.status, DOWNLOAD_STATUS.queued);
  for (const job of [first.body, second.body]) {
    await client.post(`${API_PATH.downloads}/${job.id}/cancel`).send({}).expect(HTTP_STATUS.noContent);
    await client.delete(`${API_PATH.downloads}/${job.id}`).send({}).expect(HTTP_STATUS.noContent);
  }
  process.stdout.write('Compiled pinned collection choices, scope-aware duplicates and restart persistence: passed.\n');
}
