import { readFileSync, readdirSync, writeFileSync, unlinkSync, symlinkSync, utimesSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import type { Readable } from 'node:stream';
import { unzipSync, strFromU8 } from 'fflate';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { API_PATH, DOWNLOAD_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import { DELIVERY_LIMIT } from '../shared/media';
import { ArchiveNames } from '../server/downloads/delivery/archiveNames';
import { prepareArchive, createArchiveStream } from '../server/downloads/delivery/archive';
import { createDeliveryFixture, cleanupDeliveryFixtures, IMAGE_BYTES } from './helpers/deliveryFixture';

afterEach(cleanupDeliveryFixtures);
/**
 * Collects only small test exports; production always pipes directly to the browser response.
 * @param {Readable} stream - ZIP fixture output.
 * @returns {Promise<Buffer>} Complete independent-parser fixture.
 */
async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

it('exports exactly the manifest as a valid streamed ZIP with Unicode, nested and empty files', async () => {
  const station = await createDeliveryFixture();
  await station.login();
  const job = station.createCollection({
    'album/φωτο.png': IMAGE_BYTES,
    'album/note.txt': 'Keep this',
    'empty.txt': '',
  });
  writeFileSync(`${station.queue.store.getFilePath(job.id)}.files/unlisted.txt`, 'do not export');
  const before = readdirSync(station.directory);
  const response = await station.client
    .get(`${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.archive}`)
    .responseType('arraybuffer')
    .expect(HTTP_STATUS.ok);
  const entries = unzipSync(response.body);
  expect(Object.keys(entries)).toEqual(['album/φωτο.png', 'album/note.txt', 'empty.txt']);
  expect(Buffer.from(entries['album/φωτο.png']!)).toEqual(IMAGE_BYTES);
  expect(strFromU8(entries['album/note.txt']!)).toBe('Keep this');
  expect(entries['empty.txt']).toHaveLength(0);
  expect(response.headers['content-type']).toBe('application/zip');
  expect(response.headers['content-disposition']).toContain('Saved collection.zip');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['accept-ranges']).toBe('none');
  expect(response.headers['content-length']).toBeUndefined();
  expect(readdirSync(station.directory)).toEqual(before);
  expect(station.queue.archiveAccess.has(job.id)).toBe(false);
});

it('requires authentication, completed multi-file output and a fresh archive request', async () => {
  const station = await createDeliveryFixture();
  const job = station.createCollection({ 'first.txt': 'one', 'second.txt': 'two' });
  const endpoint = `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.archive}`;
  await station.client.get(endpoint).expect(HTTP_STATUS.unauthorized);
  await station.client.head(endpoint).expect(HTTP_STATUS.unauthorized);
  await station.login();
  job.status = DOWNLOAD_STATUS.paused;
  await station.client.get(endpoint).expect(HTTP_STATUS.conflict);
  job.status = DOWNLOAD_STATUS.completed;
  const head = await station.client.head(endpoint).expect(HTTP_STATUS.ok);
  expect(head.text).toBeUndefined();
  expect(station.queue.archiveAccess.has(job.id)).toBe(false);
  await station.client.get(endpoint).set('Range', 'bytes=1-').expect(HTTP_STATUS.rangeNotSatisfiable);
  const single = station.createFile('single.png', IMAGE_BYTES);
  await station.client.get(`${API_PATH.downloads}/${single.id}${DOWNLOAD_PATH.archive}`).expect(HTTP_STATUS.badRequest);
});

it('rejects missing, changed and symbolic-link files before sending any ZIP bytes and releases the slot', async () => {
  const station = await createDeliveryFixture();
  await station.login();
  const job = station.createCollection({ 'first.txt': 'one', 'second.txt': 'two' });
  const endpoint = `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.archive}`;
  const filename = `${station.queue.store.getFilePath(job.id)}.files/second.txt`;
  unlinkSync(filename);
  const missing = await station.client.get(endpoint).expect(HTTP_STATUS.notFound);
  expect(missing.headers['content-type']).toContain('application/json');
  expect(station.queue.archiveAccess.has(job.id)).toBe(false);
  writeFileSync(filename, 'changed size');
  await station.client.get(endpoint).expect(HTTP_STATUS.conflict);
  unlinkSync(filename);
  symlinkSync(path.join(station.directory, 'history.json'), filename);
  await station.client.get(endpoint).expect(HTTP_STATUS.notFound);
  expect(station.queue.archiveAccess.has(job.id)).toBe(false);
});

it('bounds station-wide exports and blocks deletion until each idempotent lease is released', async () => {
  const station = await createDeliveryFixture();
  await station.login();
  const job = station.createCollection({ 'first.txt': 'one', 'second.txt': 'two' });
  const first = station.queue.archiveAccess.acquire(job.id)!;
  const second = station.queue.archiveAccess.acquire(job.id)!;
  const endpoint = `${API_PATH.downloads}/${job.id}`;
  const busy = await station.client.get(`${endpoint}${DOWNLOAD_PATH.archive}`).expect(HTTP_STATUS.tooManyRequests);
  expect(busy.headers['retry-after']).toBe(String(DELIVERY_LIMIT.retrySeconds));
  await station.client.delete(endpoint).send({}).expect(HTTP_STATUS.conflict);
  first();
  first();
  expect(station.queue.archiveAccess.has(job.id)).toBe(true);
  second();
  expect(station.queue.archiveAccess.has(job.id)).toBe(false);
  await station.client.delete(endpoint).send({}).expect(HTTP_STATUS.noContent);
});

it('detects a file replaced or changed after preflight and cleans up before releasing the export', async () => {
  const station = await createDeliveryFixture();
  const job = station.createCollection({ 'first.txt': 'one', 'second.txt': 'two' });
  const controller = new AbortController();
  const entries = await prepareArchive(station.queue, job, controller.signal);
  const filename = `${station.queue.store.getFilePath(job.id)}.files/first.txt`;
  const changedMilliseconds = 1_000;
  writeFileSync(filename, 'new');
  utimesSync(filename, new Date(), new Date(entries[0]!.information.mtimeMs + changedMilliseconds));
  const output = createArchiveStream(station.queue, job, entries, controller.signal);
  await expect(collect(output.stream)).rejects.toThrow('changed');
  await output.waitForFiles();
  expect(readFileSync(filename, 'utf8')).toBe('new');
});

it('aborts an export even when cancellation happens before its first lazy file open finishes', async () => {
  const station = await createDeliveryFixture();
  const job = station.createCollection({ 'first.txt': 'one', 'second.txt': 'two' });
  const controller = new AbortController();
  const entries = await prepareArchive(station.queue, job, controller.signal);
  controller.abort();
  const output = createArchiveStream(station.queue, job, entries, controller.signal);
  await expect(collect(output.stream)).rejects.toThrow('interrupted');
  await output.waitForFiles();
});

it('releases an actual HTTP export on client disconnect so the saved job can then be deleted', async () => {
  const station = await createDeliveryFixture();
  const largeBytes = 2_097_152;
  const job = station.createCollection({ 'large.bin': Buffer.alloc(largeBytes, 1), 'next.txt': 'not needed' });
  const login = await request(station.application)
    .post(API_PATH.session)
    .send({ token: station.configuration.accessToken });
  const cookie = String(login.headers['set-cookie']?.[0] ?? '').split(';')[0]!;
  const server = station.application.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP fixture listener.');
    }
    await new Promise<void>((resolve, reject) => {
      const client = http.get(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path: `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.archive}`,
          headers: { Cookie: cookie },
        },
        (response) => {
          response.once('data', () => {
            response.destroy();
            client.destroy();
            resolve();
          });
          response.on('error', () => undefined);
        },
      );
      client.on('error', reject);
    });
    await vi.waitFor(() => expect(station.queue.archiveAccess.has(job.id)).toBe(false));
    expect(() => station.queue.remove(job)).not.toThrow();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('preserves directories while sanitizing unsafe portable names and resolving file/directory collisions', () => {
  const names = new ArchiveNames();
  expect(names.add('Album/photo.png')).toBe('Album/photo.png');
  expect(names.add('Album/PHOTO.png')).toBe('Album/PHOTO (2).png');
  expect(names.add('album/note.txt')).toBe('album (2)/note.txt');
  expect(names.add('CON.txt')).toBe('_CON.txt');
  expect(names.add('bad:name?.txt')).toBe('bad_name_.txt');
  expect(names.add('file. ')).toBe('file');
  expect(names.add('file/child.txt')).toBe('file (2)/child.txt');
  expect(() => names.add('../escape.txt')).toThrow('safely');
  expect(() => names.add('/absolute.txt')).toThrow('safely');
  expect(() => names.add('C:\\outside.txt')).toThrow('safely');
  const longName = `${'φ'.repeat(DELIVERY_LIMIT.archiveComponentBytes)}.txt`;
  const renamed = names.add(longName);
  expect(Buffer.byteLength(renamed)).toBeLessThanOrEqual(DELIVERY_LIMIT.archiveComponentBytes);
  expect(renamed.endsWith('.txt')).toBe(true);
});
