import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { API_PATH, DOWNLOAD_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../dist-server/shared/contracts.js';

/** Small real raster bytes avoid codec or third-party dependencies in native HTTP checks. */
const IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1X8AAAAASUVORK5CYII=',
  'base64',
);
/** Bounded image seek checks use one PNG signature. */
const SIGNATURE_BYTES = 8;

/**
 * Exercises compiled preview streaming and a real ZIP decoded by an independent library.
 * @param {DownloadQueue} queue - Stopped isolated station queue.
 * @param {object} client - Authenticated Supertest owner client.
 * @returns {Promise<void>} Native media range and archive contents verified.
 */
export async function smokeDelivery(queue, client) {
  const image = queue.add('https://example.com/production-image');
  Object.assign(image, {
    filename: 'pixel.png',
    status: DOWNLOAD_STATUS.completed,
    receivedBytes: IMAGE.length,
    totalBytes: IMAGE.length,
  });
  writeFileSync(queue.store.getFilePath(image.id), IMAGE);
  const preview = `${API_PATH.downloads}/${image.id}${DOWNLOAD_PATH.preview}`;
  await client.head(preview).expect(HTTP_STATUS.ok);
  const partial = await client
    .get(preview)
    .set('Range', `bytes=0-${SIGNATURE_BYTES - 1}`)
    .responseType('arraybuffer')
    .expect(HTTP_STATUS.partialContent);
  assert.deepEqual(partial.body, IMAGE.subarray(0, SIGNATURE_BYTES));
  assert.equal(partial.headers['cache-control'], 'no-store');
  const collection = queue.add('https://example.com/production-collection');
  const directory = `${queue.store.getFilePath(collection.id)}.files`;
  mkdirSync(directory);
  writeFileSync(`${directory}/pixel.png`, IMAGE);
  writeFileSync(`${directory}/empty.txt`, '');
  Object.assign(collection, {
    filename: 'Production export',
    status: DOWNLOAD_STATUS.completed,
    receivedBytes: IMAGE.length,
    totalBytes: IMAGE.length,
    files: [
      { name: 'pixel.png', relativePath: 'pixel.png', sizeBytes: IMAGE.length },
      { name: 'empty.txt', relativePath: 'empty.txt', sizeBytes: 0 },
    ],
  });
  queue.store.save();
  const response = await client
    .get(`${API_PATH.downloads}/${collection.id}${DOWNLOAD_PATH.archive}`)
    .responseType('arraybuffer')
    .expect(HTTP_STATUS.ok);
  const entries = unzipSync(response.body);
  assert.deepEqual(Object.keys(entries), ['pixel.png', 'empty.txt']);
  assert.deepEqual(Buffer.from(entries['pixel.png']), IMAGE);
  assert.equal(entries['empty.txt'].length, 0);
  assert.equal(queue.archiveAccess.has(collection.id), false);
  process.stdout.write('Compiled preview ranges and independently decoded ZIP delivery: passed.\n');
}
