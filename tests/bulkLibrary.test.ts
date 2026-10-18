import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { BULK_ACTION, BULK_LIBRARY, TAG_MODE, validateBulkLibrary, type BulkOrganization } from '../shared/bulkLibrary';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import { LIBRARY_LIMIT } from '../shared/library';
import { DownloadStore } from '../server/downloads/store';
import { createDeliveryFixture, cleanupDeliveryFixtures } from './helpers/deliveryFixture';

const ENDPOINT = `${API_PATH.downloads}${BULK_LIBRARY.path}`;
const ID = '2973533c-346f-49cf-9c9e-378378d820f8';
const BASE: BulkOrganization = { action: BULK_ACTION.organize, ids: [ID], folder: 'Trips' };
const TWO = 2;
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupDeliveryFixtures();
});

it.each([
  null,
  {},
  { ...BASE, ids: [] },
  { ...BASE, ids: [ID, ID] },
  { ...BASE, ids: ['../outside'] },
  { ...BASE, ids: [1] },
  { ...BASE, ids: Array.from({ length: BULK_LIBRARY.maximum + 1 }, () => randomUUID()) },
  { ...BASE, folder: null },
  { ...BASE, folder: '../outside' },
  { ...BASE, tagMode: 'unknown', tags: [] },
  { ...BASE, tagMode: TAG_MODE.replace },
  { ...BASE, tags: [] },
  { action: BULK_ACTION.organize, ids: [ID] },
  { action: BULK_ACTION.delete, ids: [ID] },
  { action: BULK_ACTION.delete, ids: [ID], confirmation: true },
])('rejects malformed membership, ambiguous edits or unconfirmed deletion %#', (input) => {
  expect(() => validateBulkLibrary(input)).toThrow();
});

it('requires an owner session and rejects cross-origin or non-JSON bulk mutations', async () => {
  const fixture = await createDeliveryFixture();
  await request(fixture.application).post(ENDPOINT).send(BASE).expect(HTTP_STATUS.unauthorized);
  await fixture.login();
  await fixture.client.post(ENDPOINT).set('Origin', 'https://outside.example').send(BASE).expect(HTTP_STATUS.forbidden);
  await fixture.client.post(ENDPOINT).type('form').send('action=delete').expect(HTTP_STATUS.forbidden);
});

it('normalizes a partial folder edit, preserves individual tags and persists all records with one write', async () => {
  const fixture = await createDeliveryFixture();
  const first = fixture.createFile('first.txt', Buffer.from('one'));
  const second = fixture.createFile('second.txt', Buffer.from('two'));
  fixture.queue.organize(first, { folder: 'Original', tags: ['Keep'] });
  fixture.queue.organize(second, { folder: 'Other', tags: ['Distinct'] });
  const save = vi.spyOn(fixture.queue.store, 'save');
  await fixture.login();
  const response = await fixture.client
    .post(ENDPOINT)
    .send({ ...BASE, ids: [first.id, second.id], folder: ' New   folder ' });
  expect(response.status).toBe(HTTP_STATUS.ok);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.updatedIds).toEqual([first.id, second.id]);
  expect(save).toHaveBeenCalledTimes(1);
  const restored = new DownloadStore(fixture.directory).jobs;
  expect(restored.find((job) => job.id === first.id)?.library).toEqual({ folder: 'New folder', tags: ['Keep'] });
  expect(restored.find((job) => job.id === second.id)?.library).toEqual({ folder: 'New folder', tags: ['Distinct'] });
  expect(readFileSync(fixture.queue.store.getFilePath(first.id), 'utf8')).toBe('one');
});

it('merges tags without regard to case, preserves folder/spelling and explicitly clears', async () => {
  const fixture = await createDeliveryFixture();
  const job = fixture.createFile('first.txt', Buffer.from('one'));
  fixture.queue.organize(job, { folder: 'Original', tags: ['Keep'] });
  await fixture.login();
  const edit = { action: BULK_ACTION.organize, ids: [job.id], tagMode: TAG_MODE.add, tags: ['keep', ' New '] };
  await fixture.client.post(ENDPOINT).send(edit).expect(HTTP_STATUS.ok);
  expect(job.library).toEqual({ folder: 'Original', tags: ['Keep', 'New'] });
  await fixture.client
    .post(ENDPOINT)
    .send({ ...edit, tagMode: TAG_MODE.remove, tags: ['KEEP'] })
    .expect(HTTP_STATUS.ok);
  expect(job.library).toEqual({ folder: 'Original', tags: ['New'] });
  await fixture.client.post(ENDPOINT).send({ ...edit, tagMode: TAG_MODE.replace, tags: [], folder: '' });
  expect(job.library).toEqual({ folder: '', tags: [] });
});

it('rejects missing IDs and a tag-limit overflow anywhere in the selection without editing the first job', async () => {
  const fixture = await createDeliveryFixture();
  const first = fixture.createFile('first.txt', Buffer.from('one'));
  const second = fixture.createFile('second.txt', Buffer.from('two'));
  fixture.queue.organize(second, {
    folder: '',
    tags: Array.from({ length: LIBRARY_LIMIT.tags }, (_, i) => `Tag ${i}`),
  });
  const save = vi.spyOn(fixture.queue.store, 'save');
  await fixture.login();
  await fixture.client
    .post(ENDPOINT)
    .send({ ...BASE, ids: [first.id, randomUUID()] })
    .expect(HTTP_STATUS.conflict);
  await fixture.client
    .post(ENDPOINT)
    .send({
      ...BASE,
      ids: [first.id, second.id],
      tagMode: TAG_MODE.add,
      tags: ['Overflow'],
    })
    .expect(HTTP_STATUS.conflict);
  expect(save).not.toHaveBeenCalled();
  expect(first.library).toBeUndefined();
  expect(second.library?.tags).toHaveLength(LIBRARY_LIMIT.tags);
});

it('rolls back every in-memory label after a failed atomic history write', async () => {
  const fixture = await createDeliveryFixture();
  const first = fixture.createFile('first.txt', Buffer.from('one'));
  const second = fixture.createFile('second.txt', Buffer.from('two'));
  fixture.queue.organize(second, { folder: 'Original', tags: [] });
  vi.spyOn(fixture.queue.store, 'save').mockImplementationOnce(() => {
    throw new Error('private/path disk full');
  });
  await fixture.login();
  const result = await fixture.client.post(ENDPOINT).send({ ...BASE, ids: [first.id, second.id] });
  expect(result.status).toBe(HTTP_STATUS.conflict);
  expect(result.body.error).not.toContain('private/path');
  expect(first.library).toBeUndefined();
  expect(second.library).toEqual({ folder: 'Original', tags: [] });
  const restored = new DownloadStore(fixture.directory).jobs;
  expect(restored.find((job) => job.id === first.id)?.library).toBeUndefined();
  expect(restored.find((job) => job.id === second.id)?.library).toEqual(second.library);
});

it.each([DOWNLOAD_STATUS.queued, DOWNLOAD_STATUS.paused, DOWNLOAD_STATUS.downloading])(
  'rejects the whole deletion selection if any job is %s',
  async (status) => {
    const fixture = await createDeliveryFixture();
    const first = fixture.createFile('first.txt', Buffer.from('one'));
    const second = fixture.createFile('second.txt', Buffer.from('two'));
    second.status = status;
    await fixture.login();
    await fixture.client
      .post(ENDPOINT)
      .send({
        action: BULK_ACTION.delete,
        ids: [first.id, second.id],
        confirmation: BULK_LIBRARY.confirmation,
      })
      .expect(HTTP_STATUS.conflict);
    expect(existsSync(fixture.queue.store.getFilePath(first.id))).toBe(true);
    expect(fixture.queue.store.jobs).toHaveLength(TWO);
  },
);

it('rejects missing members or any active ZIP export before deleting another selected file', async () => {
  const fixture = await createDeliveryFixture();
  const first = fixture.createFile('first.txt', Buffer.from('one'));
  const collection = fixture.createCollection({ 'a.txt': 'a', 'b.txt': 'b' });
  await fixture.login();
  const deletion = {
    action: BULK_ACTION.delete,
    ids: [first.id, collection.id],
    confirmation: BULK_LIBRARY.confirmation,
  };
  const release = fixture.queue.archiveAccess.acquire(collection.id);
  expect(release).not.toBeNull();
  try {
    await fixture.client.post(ENDPOINT).send(deletion).expect(HTTP_STATUS.conflict);
    await fixture.client
      .post(ENDPOINT)
      .send({ ...deletion, ids: [first.id, randomUUID()] })
      .expect(HTTP_STATUS.conflict);
    expect(existsSync(fixture.queue.store.getFilePath(first.id))).toBe(true);
  } finally {
    release?.();
  }
  const response = await fixture.client.post(ENDPOINT).send(deletion).expect(HTTP_STATUS.ok);
  expect(response.body.deletedIds).toEqual(deletion.ids);
  expect(existsSync(fixture.queue.store.getFilePath(first.id))).toBe(false);
  expect(existsSync(`${fixture.queue.store.getFilePath(collection.id)}.files`)).toBe(false);
  expect(new DownloadStore(fixture.directory).jobs).toHaveLength(0);
});

it('acknowledges partial file deletion and retains a retryable record after a history write failure', async () => {
  const fixture = await createDeliveryFixture();
  const first = fixture.createFile('first.txt', Buffer.from('one'));
  const second = fixture.createFile('second.txt', Buffer.from('two'));
  vi.spyOn(fixture.queue.store, 'save').mockImplementationOnce(() => {
    throw new Error('private/path disk full');
  });
  await fixture.login();
  const deletion = { action: BULK_ACTION.delete, ids: [first.id, second.id], confirmation: BULK_LIBRARY.confirmation };
  const response = await fixture.client.post(ENDPOINT).send(deletion).expect(HTTP_STATUS.ok);
  expect(response.body.deletedIds).toEqual([second.id]);
  expect(response.body.failures).toEqual([{ id: first.id, message: expect.stringContaining('already be removed') }]);
  expect(response.text).not.toContain('private/path');
  expect(existsSync(fixture.queue.store.getFilePath(first.id))).toBe(false);
  expect(fixture.queue.store.jobs.map((job) => job.id)).toEqual([first.id]);
  expect(new DownloadStore(fixture.directory).jobs.map((job) => job.id)).toEqual([first.id]);
  await fixture.client
    .post(ENDPOINT)
    .send({ ...deletion, ids: [first.id] })
    .expect(HTTP_STATUS.ok);
  expect(fixture.queue.store.jobs).toHaveLength(0);
});

it('organizes unfinished jobs and permits deletion of finished failed and cancelled records', async () => {
  const fixture = await createDeliveryFixture();
  const first = fixture.queue.add('https://example.com/unfinished');
  const second = fixture.queue.add('https://example.com/failed');
  await fixture.login();
  await fixture.client
    .post(ENDPOINT)
    .send({ ...BASE, ids: [first.id, second.id] })
    .expect(HTTP_STATUS.ok);
  first.status = DOWNLOAD_STATUS.failed;
  second.status = DOWNLOAD_STATUS.cancelled;
  const response = await fixture.client
    .post(ENDPOINT)
    .send({
      action: BULK_ACTION.delete,
      ids: [first.id, second.id],
      confirmation: BULK_LIBRARY.confirmation,
    })
    .expect(HTTP_STATUS.ok);
  expect(response.body.deletedIds).toHaveLength(TWO);
  expect(fixture.queue.store.jobs).toHaveLength(0);
});
