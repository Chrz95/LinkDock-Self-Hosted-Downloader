import assert from 'node:assert/strict';
import { writeFileSync, existsSync } from 'node:fs';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../dist-server/shared/contracts.js';
import { BULK_ACTION, BULK_LIBRARY, TAG_MODE } from '../dist-server/shared/bulkLibrary.js';
import { DownloadStore } from '../dist-server/server/downloads/store.js';

/**
 * Checks compiled bulk routing, durable partial edits and confirmed physical file deletion.
 * @param {DownloadQueue} queue - Stopped isolated fixture station.
 * @param {object} client - Authenticated native HTTP client.
 * @param {string} directory - Private fixture volume.
 * @returns {Promise<void>} Bulk organization and explicit deletion verified without source requests.
 */
export async function smokeBulkLibrary(queue, client, directory) {
  const jobs = ['first', 'second'].map((name) => {
    const job = queue.add(`https://example.com/native-bulk-${name}`);
    Object.assign(job, { status: DOWNLOAD_STATUS.completed, receivedBytes: name.length, totalBytes: name.length });
    writeFileSync(queue.store.getFilePath(job.id), name);
    queue.organize(job, { folder: name, tags: ['Keep'] });
    return job;
  });
  const endpoint = `${API_PATH.downloads}${BULK_LIBRARY.path}`;
  const ids = jobs.map((job) => job.id);
  const response = await client
    .post(endpoint)
    .send({
      action: BULK_ACTION.organize,
      ids,
      folder: 'Native bulk check',
      tagMode: TAG_MODE.add,
      tags: ['Verified'],
    })
    .expect(HTTP_STATUS.ok);
  assert.deepEqual(response.body.updatedIds, ids);
  const restored = new DownloadStore(directory).jobs;
  for (const job of jobs) {
    assert.deepEqual(restored.find((record) => record.id === job.id)?.library, {
      folder: 'Native bulk check',
      tags: ['Keep', 'Verified'],
    });
  }
  await client.post(endpoint).send({ action: BULK_ACTION.delete, ids }).expect(HTTP_STATUS.badRequest);
  assert.ok(jobs.every((job) => existsSync(queue.store.getFilePath(job.id))));
  const deleted = await client
    .post(endpoint)
    .send({
      action: BULK_ACTION.delete,
      ids,
      confirmation: BULK_LIBRARY.confirmation,
    })
    .expect(HTTP_STATUS.ok);
  assert.deepEqual(deleted.body.deletedIds, ids);
  assert.deepEqual(deleted.body.failures, []);
  assert.ok(jobs.every((job) => !existsSync(queue.store.getFilePath(job.id))));
  assert.ok(new DownloadStore(directory).jobs.every((job) => !ids.includes(job.id)));
  process.stdout.write('Compiled bulk routing, partial label persistence and confirmed file deletion: passed.\n');
}
