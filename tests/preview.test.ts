import { symlinkSync, unlinkSync, truncateSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { API_PATH, DOWNLOAD_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import { DELIVERY_LIMIT, getPreviewFormat } from '../shared/media';
import { resolveByteRange } from '../server/downloads/delivery/range';
import { matchesMediaHeader } from '../server/downloads/delivery/mediaHeader';
import { createDeliveryFixture, cleanupDeliveryFixtures, IMAGE_BYTES, VIDEO_BYTES } from './helpers/deliveryFixture';

const RANGE_SIZE = 10;
const RANGE_LAST = 9;
const RANGE_FIRST = 2;
const RANGE_END = 5;
afterEach(cleanupDeliveryFixtures);

it('requires a session for GET and HEAD and keeps unfinished bytes private', async () => {
  const station = await createDeliveryFixture();
  const job = station.createFile('photo.png', IMAGE_BYTES);
  const url = `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.preview}`;
  await station.client.get(url).expect(HTTP_STATUS.unauthorized);
  await station.client.head(url).expect(HTTP_STATUS.unauthorized);
  await station.login();
  job.status = DOWNLOAD_STATUS.paused;
  await station.client.get(url).expect(HTTP_STATUS.conflict);
});

it('serves recognized raster bytes unchanged with inline, no-store and restrictive media headers', async () => {
  const station = await createDeliveryFixture();
  await station.login();
  const job = station.createFile('photo.PNG', IMAGE_BYTES);
  const url = `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.preview}`;
  const response = await station.client.get(url).expect(HTTP_STATUS.ok);
  expect(response.body).toEqual(IMAGE_BYTES);
  expect(response.headers).toMatchObject({
    'content-type': 'image/png',
    'content-disposition': 'inline',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  });
  expect(response.headers['content-security-policy']).toContain('sandbox');
  const head = await station.client.head(url).expect(HTTP_STATUS.ok);
  expect(head.headers['content-length']).toBe(String(IMAGE_BYTES.length));
  expect(head.text).toBeUndefined();
});

it('supports exact video seek bytes and ignores unvalidated If-Range conditions safely', async () => {
  const station = await createDeliveryFixture();
  await station.login();
  const job = station.createFile('clip.mp4', VIDEO_BYTES);
  const url = `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.preview}`;
  const response = await station.client.get(url).set('Range', 'bytes=2-5').expect(HTTP_STATUS.partialContent);
  expect(response.body).toEqual(VIDEO_BYTES.subarray(RANGE_FIRST, RANGE_END + 1));
  expect(response.headers['content-range']).toBe(`bytes 2-5/${VIDEO_BYTES.length}`);
  expect(response.headers['accept-ranges']).toBe('bytes');
  const full = await station.client
    .get(url)
    .set('Range', 'bytes=2-5')
    .set('If-Range', '"unknown"')
    .expect(HTTP_STATUS.ok);
  expect(full.body).toEqual(VIDEO_BYTES);
  const invalid = await station.client.get(url).set('Range', 'bytes=999-').expect(HTTP_STATUS.rangeNotSatisfiable);
  expect(invalid.headers['content-range']).toBe(`bytes */${VIDEO_BYTES.length}`);
});

it('rejects active documents, renamed HTML and oversized images before streaming their bodies', async () => {
  const station = await createDeliveryFixture();
  await station.login();
  for (const name of ['page.html', 'vector.svg', 'document.pdf', 'fake.png']) {
    const job = station.createFile(name, Buffer.from('<script>private-content</script>'));
    const response = await station.client
      .get(`${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.preview}`)
      .expect(HTTP_STATUS.unsupportedMediaType);
    expect(JSON.stringify(response.body)).not.toContain('private-content');
  }
  const large = station.createFile('large.png', IMAGE_BYTES);
  truncateSync(station.queue.store.getFilePath(large.id), DELIVERY_LIMIT.maximumImageBytes + 1);
  await station.client.head(`${API_PATH.downloads}/${large.id}${DOWNLOAD_PATH.preview}`).expect(HTTP_STATUS.tooLarge);
});

it('supports indexed artifacts and rejects ambiguous indices, missing files, traversal and symlinks', async () => {
  const station = await createDeliveryFixture();
  await station.login();
  const job = station.createCollection({ 'album/photo.png': IMAGE_BYTES, 'clip.mp4': VIDEO_BYTES });
  const base = `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.preview}`;
  await station.client.head(`${base}/0`).expect(HTTP_STATUS.ok);
  for (const index of ['-1', '01', '1e0', '99']) {
    await station.client.head(`${base}/${index}`).expect(HTTP_STATUS.notFound);
  }
  const published = `${station.queue.store.getFilePath(job.id)}.files`;
  unlinkSync(path.join(published, 'album/photo.png'));
  symlinkSync(path.join(station.directory, 'history.json'), path.join(published, 'album/photo.png'));
  await station.client.get(`${base}/0`).expect(HTTP_STATUS.notFound);
  const direct = station.createFile('direct.png', IMAGE_BYTES);
  unlinkSync(station.queue.store.getFilePath(direct.id));
  symlinkSync(path.join(station.directory, 'history.json'), station.queue.store.getFilePath(direct.id));
  await station.client.get(`${API_PATH.downloads}/${direct.id}${DOWNLOAD_PATH.preview}`).expect(HTTP_STATUS.notFound);
});

it.each([
  '',
  'bytes=',
  'items=0-1',
  'bytes=0-1,3-4',
  'bytes=-0',
  'bytes=3-2',
  'bytes=10-',
  'bytes=9007199254740992-',
  'bytes=--1',
])('rejects invalid or unsatisfiable range %s', (value) => {
  expect(resolveByteRange(value, RANGE_SIZE)).toBeNull();
});

it('handles bounded, open-ended and suffix range forms including clamping and empty files', () => {
  expect(resolveByteRange('bytes=2-5', RANGE_SIZE)).toEqual({ start: RANGE_FIRST, end: RANGE_END, isPartial: true });
  expect(resolveByteRange('bytes=2-', RANGE_SIZE)).toEqual({ start: RANGE_FIRST, end: RANGE_LAST, isPartial: true });
  expect(resolveByteRange('bytes=-10', RANGE_SIZE)).toEqual({ start: 0, end: RANGE_LAST, isPartial: true });
  expect(resolveByteRange('bytes=0-999', RANGE_SIZE)).toEqual({ start: 0, end: RANGE_LAST, isPartial: true });
  expect(resolveByteRange('bytes=0-', 0)).toBeNull();
  expect(resolveByteRange(undefined, 0)).toEqual({ start: 0, end: -1, isPartial: false });
});

it('checks each allowed container prefix and rejects a different extension or missing WebM document type', () => {
  const fixtures = [
    ['photo.jpg', Buffer.from('ffd8ffe000', 'hex')],
    ['photo.png', IMAGE_BYTES],
    ['photo.gif', Buffer.from('GIF89a')],
    ['photo.webp', Buffer.from('RIFF0000WEBP')],
    ['clip.mp4', VIDEO_BYTES],
    ['clip.webm', Buffer.from('1a45dfa34282847765626d', 'hex')],
  ] as const;
  for (const [name, bytes] of fixtures) {
    expect(matchesMediaHeader(bytes, getPreviewFormat(name)!)).toBe(true);
  }
  expect(matchesMediaHeader(IMAGE_BYTES, getPreviewFormat('clip.mp4')!)).toBe(false);
  expect(matchesMediaHeader(Buffer.from('1a45dfa3', 'hex'), getPreviewFormat('clip.webm')!)).toBe(false);
  expect(getPreviewFormat('vector.svg')).toBeNull();
});
