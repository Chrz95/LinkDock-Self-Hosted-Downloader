import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { DEVIANTART, DEVIANTART_ACTION, defaultDeviantartPreferences } from '../shared/deviantart';
import { API_PATH, DOWNLOAD_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import { SOURCE_TYPE } from '../shared/sources';
import { DownloadStore } from '../server/downloads/store';
import { DownloadQueue } from '../server/downloads/queue';
import { validateHistory } from '../server/downloads/validateHistory';
import { DeviantartStore } from '../server/deviantart/store';
import { holdLegacyCollections, needsCollectionRestart } from '../server/deviantart/jobScope';
import { prepareDeviantartSession } from '../server/deviantart/session';
import { reviewBatch } from '../server/downloads/batch';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';

const PROFILE = 'https://deviantart.com/artist';
afterEach(async () => {
  await cleanupDeliveryFixtures();
  vi.restoreAllMocks();
});

it('pins canonical preferences for single and batch jobs without account material or shared arrays', async () => {
  const { queue, directory, client, login } = await createDeliveryFixture();
  await login();
  const source = new DeviantartStore(directory);
  source.replaceAccount(source.read(), { refreshToken: 'private-scope-token', clientId: '', clientSecret: '' });
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.preferences, include: ['status', 'gallery'], original: false, stories: 'html' })
    .expect(HTTP_STATUS.ok);
  const expected = { include: ['gallery', 'status'], original: false, stories: 'html' };
  const job = queue.add(PROFILE);
  expect(job.deviantart).toEqual(expected);
  const result = await client
    .post(`${API_PATH.downloads}${DOWNLOAD_PATH.batch}`)
    .send({
      urls: ['https://deviantart.com/second', 'https://deviantart.com/third', 'https://example.com/direct'],
    })
    .expect(HTTP_STATUS.created);
  expect(result.body.added[0].deviantart).toEqual(expected);
  expect(result.body.added[1].deviantart).toEqual(expected);
  expect(result.body.added[2].deviantart).toBeUndefined();
  const first = queue.store.jobs.find((item) => item.url.endsWith('/second'))!;
  expect(first.deviantart?.include).not.toBe(job.deviantart?.include);
  expect(readFileSync(path.join(directory, 'history.json'), 'utf8')).not.toContain('private-scope-token');
  expect(new DownloadStore(directory).jobs.find((item) => item.id === job.id)?.deviantart).toEqual(expected);
});

it('reviews duplicates by scope and preserves choices on settings changes and retry', async () => {
  const { queue, client, login, directory } = await createDeliveryFixture();
  await login();
  const original = queue.add(PROFILE);
  expect(queue.previewBatch([PROFILE]).newCount).toBe(0);
  const changed = { include: ['scraps'], original: false, stories: 'none' };
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.preferences, ...changed })
    .expect(HTTP_STATUS.ok);
  expect(original.deviantart).toEqual(defaultDeviantartPreferences());
  expect(queue.previewBatch([PROFILE, PROFILE])).toEqual({ newCount: 1, duplicates: [PROFILE] });
  const fresh = queue.add(PROFILE);
  expect(fresh.deviantart).toEqual(changed);
  expect(queue.previewBatch([PROFILE]).newCount).toBe(0);
  original.status = DOWNLOAD_STATUS.paused;
  queue.retry(original);
  expect(original.deviantart).toEqual(defaultDeviantartPreferences());
  const session = await prepareDeviantartSession(directory, original.deviantart);
  expect(session.preferences).toEqual(defaultDeviantartPreferences());
  await session.cleanup();
});

it('rejects malformed, noncanonical or secret-bearing history scopes and retains older readable records', async () => {
  const { queue } = await createDeliveryFixture();
  const job = queue.add(PROFILE);
  for (const scope of [
    null,
    {},
    { ...job.deviantart, include: [] },
    { ...job.deviantart, include: ['journal', 'gallery'] },
    { ...job.deviantart, refreshToken: 'never-in-history' },
    { ...job.deviantart, stories: 'execute' },
  ]) {
    expect(() => validateHistory([{ ...job, deviantart: scope }])).toThrow('History is invalid');
  }
  expect(() => validateHistory([{ ...job, url: 'https://example.com/file', sourceType: SOURCE_TYPE.direct }])).toThrow(
    'History is invalid',
  );
  const legacy = { ...job, deviantart: undefined };
  expect(validateHistory([legacy])[0]).toEqual(legacy);
  const preferences = vi.fn(defaultDeviantartPreferences);
  expect(reviewBatch([PROFILE], undefined, undefined, [legacy], preferences).unique).toHaveLength(1);
  expect(preferences).toHaveBeenCalledOnce();
});

it('preserves ambiguous legacy partials on startup until an explicit restart', async () => {
  const { queue, configuration, directory } = await createDeliveryFixture();
  const job = queue.add(PROFILE);
  delete job.deviantart;
  const working = `${queue.store.getFilePath(job.id)}.work`;
  mkdirSync(working);
  const partial = path.join(working, 'old-photo.jpg');
  writeFileSync(partial, 'saved-partial');
  queue.store.save();
  writeFileSync(path.join(directory, 'controls.json'), JSON.stringify({ paused: true, tasks: [] }));
  const restored = new DownloadQueue(configuration);
  try {
    const legacy = restored.store.jobs[0]!;
    expect(legacy.status).toBe(DOWNLOAD_STATUS.paused);
    expect(legacy.stage).toBe(DEVIANTART.legacyStage);
    expect(readFileSync(partial, 'utf8')).toBe('saved-partial');
    expect(() => restored.resume(legacy)).toThrow('Restart');
    expect(restored.resumeAll()).toBe(0);
    restored.retry(legacy);
    expect(existsSync(working)).toBe(false);
    expect(legacy.deviantart).toEqual(defaultDeviantartPreferences());
    expect(legacy.status).toBe(DOWNLOAD_STATUS.queued);
  } finally {
    await restored.stop();
  }
});

it('does not hold empty staging or already-published payloads during legacy recovery', async () => {
  const { queue } = await createDeliveryFixture();
  const job = queue.add(PROFILE);
  delete job.deviantart;
  const working = `${queue.store.getFilePath(job.id)}.work`;
  mkdirSync(working);
  expect(needsCollectionRestart(job, queue.store)).toBe(false);
  writeFileSync(path.join(working, 'payload.txt'), 'saved');
  job.payloadReady = true;
  expect(needsCollectionRestart(job, queue.store)).toBe(false);
  holdLegacyCollections(queue.store);
  expect(job.status).toBe(DOWNLOAD_STATUS.queued);
});

it('isolates broken source settings and rejects mixed batches atomically', async () => {
  const { queue, directory } = await createDeliveryFixture();
  writeFileSync(new DeviantartStore(directory).filename, '{ broken-private-state');
  expect(queue.add('https://example.com/file').deviantart).toBeUndefined();
  const before = queue.store.jobs.length;
  expect(() => queue.addBatch(['https://example.com/other', PROFILE])).toThrow('unreadable');
  expect(queue.store.jobs).toHaveLength(before);
});
