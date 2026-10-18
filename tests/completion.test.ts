import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { moveCompleted } from '../server/downloads/completion/move';
import * as journal from '../server/downloads/completion/journal';
import { MOVE, writeJournal } from '../server/downloads/completion/journal';
import { destinationDirectory } from '../server/downloads/completion/paths';
import { DownloadQueue } from '../server/downloads/queue';
import { validateDestination } from '../shared/jobOptions';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import { createDeliveryFixture, cleanupDeliveryFixtures, IMAGE_BYTES } from './helpers/deliveryFixture';

const SIZE = 3;
afterEach(async () => {
  await cleanupDeliveryFixtures();
  vi.restoreAllMocks();
});

it('moves a direct file, saves its routing before cleanup, and keeps file/preview/ZIP delivery private', async () => {
  const station = await createDeliveryFixture();
  const { queue, client, login, configuration } = station;
  const job = station.createFile('photo.png', IMAGE_BYTES);
  job.payloadReady = true;
  job.destination = { directory: 'Pictures/Travel', moved: false, error: null };
  await moveCompleted(job, queue.store, new AbortController().signal);
  const directory = destinationDirectory(queue.store.completedDirectory, job);
  expect(readFileSync(path.join(directory, MOVE.files, 'photo.png'))).toEqual(IMAGE_BYTES);
  expect(existsSync(queue.store.getFilePath(job.id))).toBe(false);
  const endpoint = `${API_PATH.downloads}/${job.id}`;
  await client.get(`${endpoint}/file`).expect(HTTP_STATUS.unauthorized);
  await login();
  expect((await client.get(`${endpoint}/files/0`).expect(HTTP_STATUS.ok)).body).toEqual(IMAGE_BYTES);
  await client.get(`${endpoint}/preview`).expect(HTTP_STATUS.ok);
  await client.get(`${endpoint}/archive`).expect(HTTP_STATUS.badRequest);
  const collection = station.createCollection({ 'a.txt': 'one', 'folder/b.txt': 'two' });
  collection.destination = { directory: 'Collections', moved: false, error: null };
  await moveCompleted(collection, queue.store, new AbortController().signal);
  const archive = await client.get(`${API_PATH.downloads}/${collection.id}/archive`).expect(HTTP_STATUS.ok);
  expect(archive.headers['content-type']).toContain('application/zip');
  const recovered = new DownloadQueue(configuration);
  try {
    expect(recovered.store.getOutputDirectory(recovered.store.jobs.find((entry) => entry.id === job.id)!)).toBe(
      path.join(directory, MOVE.files),
    );
  } finally {
    await recovered.stop();
  }
  queue.remove(job);
  expect(existsSync(directory)).toBe(false);
});

it('retains original files on history failure and safely adopts an already prepared destination on retry', async () => {
  const { queue, createCollection } = await createDeliveryFixture();
  const job = createCollection({ 'folder/clip.mp4': 'yes', 'other.txt': 'other' });
  job.payloadReady = true;
  job.destination = { directory: 'Media', moved: false, error: null };
  vi.spyOn(queue.store, 'save').mockImplementationOnce(() => {
    throw new Error('History write failed');
  });
  await expect(moveCompleted(job, queue.store, new AbortController().signal)).rejects.toThrow('History write failed');
  expect(job.destination.moved).toBe(false);
  expect(existsSync(`${queue.store.getFilePath(job.id)}.files/folder/clip.mp4`)).toBe(true);
  await moveCompleted(job, queue.store, new AbortController().signal);
  expect(job.destination.moved).toBe(true);
  expect(readFileSync(path.join(queue.store.getOutputDirectory(job), 'folder/clip.mp4'), 'utf8')).toBe('yes');
});

it('never overwrites an unowned existing folder or follows a symlinked destination ancestor', async () => {
  const { queue, createFile, directory } = await createDeliveryFixture();
  const job = createFile('saved.bin', Buffer.from('yes'));
  job.destination = { directory: 'Media', moved: false, error: null };
  const target = destinationDirectory(queue.store.completedDirectory, job, true);
  mkdirSync(target);
  writeFileSync(path.join(target, 'keep.txt'), 'keep');
  await expect(moveCompleted(job, queue.store, new AbortController().signal)).rejects.toThrow();
  expect(readFileSync(path.join(target, 'keep.txt'), 'utf8')).toBe('keep');
  rmSync(target, { recursive: true });
  const outside = path.join(directory, 'outside');
  mkdirSync(outside);
  rmSync(path.dirname(target), { recursive: true });
  symlinkSync(outside, path.dirname(target), 'dir');
  await expect(moveCompleted(job, queue.store, new AbortController().signal)).rejects.toThrow('Unsafe completion');
  expect(readFileSync(queue.store.getFilePath(job.id), 'utf8')).toBe('yes');
  expect(() => validateDestination('../escape')).toThrow();
  expect(() => validateDestination('/absolute')).toThrow();
  const overlongUnicode = 100;
  expect(() => validateDestination('画'.repeat(overlongUnicode))).toThrow();
  expect(validateDestination('Cafe\u0301')).toBe('Café');
});

it('refuses recovery if a prepared output has the right length but changed bytes', async () => {
  const { queue, createFile } = await createDeliveryFixture();
  const job = createFile('saved.bin', Buffer.from('yes'));
  job.destination = { directory: 'Media', moved: false, error: null };
  const target = destinationDirectory(queue.store.completedDirectory, job, true);
  mkdirSync(path.join(target, MOVE.files), { recursive: true });
  writeFileSync(path.join(target, MOVE.files, 'saved.bin'), 'bad');
  writeJournal(target, {
    jobId: job.id,
    phase: 'prepared',
    files: [{ name: 'saved.bin', relativePath: 'saved.bin', sizeBytes: SIZE }],
    hashes: [createHash('sha256').update('yes').digest('hex')],
  });
  await expect(moveCompleted(job, queue.store, new AbortController().signal)).rejects.toThrow('Destination changed');
  expect(readFileSync(queue.store.getFilePath(job.id), 'utf8')).toBe('yes');
});

it('records a failed move as a saved download and retries using payload bytes without a source request', async () => {
  const station = await createDeliveryFixture();
  const { queue, configuration, directory } = station;
  const job = station.createFile('saved.bin', Buffer.from('yes'));
  const blockedRoot = path.join(directory, 'blocked');
  writeFileSync(blockedRoot, 'not a directory');
  configuration.completedDirectory = blockedRoot;
  queue.setDestination(job, 'Media');
  const recovered = new DownloadQueue(configuration);
  try {
    const saved = recovered.store.jobs[0]!;
    await vi.waitFor(() => expect(saved.status).toBe(DOWNLOAD_STATUS.completed));
    expect(saved.destination?.error).toContain('Files remain on the station');
    expect(readFileSync(recovered.store.getFilePath(saved.id), 'utf8')).toBe('yes');
    rmSync(blockedRoot);
    mkdirSync(blockedRoot);
    recovered.retryMove(saved);
    await vi.waitFor(() => expect(saved.destination?.moved).toBe(true));
    await vi.waitFor(() => expect(saved.status).toBe(DOWNLOAD_STATUS.completed));
    expect(readFileSync(path.join(recovered.store.getOutputDirectory(saved), 'saved.bin'), 'utf8')).toBe('yes');
  } finally {
    await recovered.stop();
  }
});

it(
  'does not alter a destination on invalid input or failed persistence and ' + 'refuses moves during ZIP access',
  async () => {
    const { queue, createFile } = await createDeliveryFixture();
    const job = createFile('file.bin', Buffer.from('yes'));
    expect(() => queue.setDestination(job, '../escape')).toThrow();
    vi.spyOn(queue.store, 'save').mockImplementationOnce(() => {
      throw new Error('Disk full');
    });
    expect(() => queue.setDestination(job, 'Movies')).toThrow('Disk full');
    expect(job.destination).toBeUndefined();
    expect(job.status).toBe(DOWNLOAD_STATUS.completed);
    const release = queue.archiveAccess.acquire(job.id);
    try {
      expect(() => queue.setDestination(job, 'Movies')).toThrow('ZIP');
    } finally {
      release?.();
    }
  },
);

it('honors an already aborted move without changing either saved routing or original bytes', async () => {
  const { queue, createFile } = await createDeliveryFixture();
  const job = createFile('file.bin', Buffer.from('yes'));
  job.destination = { directory: 'Media', moved: false, error: null };
  const controller = new AbortController();
  controller.abort();
  await expect(moveCompleted(job, queue.store, controller.signal)).rejects.toThrow();
  expect(job.destination.moved).toBe(false);
  expect(readFileSync(queue.store.getFilePath(job.id), 'utf8')).toBe('yes');
});

it('cleans a newly created destination if its ownership journal cannot be saved', async () => {
  const { queue, createFile } = await createDeliveryFixture();
  const job = createFile('file.bin', Buffer.from('yes'));
  job.destination = { directory: 'Media', moved: false, error: null };
  vi.spyOn(journal, 'writeJournal').mockImplementationOnce(() => {
    throw new Error('Disk full');
  });
  await expect(moveCompleted(job, queue.store, new AbortController().signal)).rejects.toThrow('Disk full');
  expect(existsSync(destinationDirectory(queue.store.completedDirectory, job))).toBe(false);
  expect(readFileSync(queue.store.getFilePath(job.id), 'utf8')).toBe('yes');
  await moveCompleted(job, queue.store, new AbortController().signal);
  expect(job.destination.moved).toBe(true);
});
