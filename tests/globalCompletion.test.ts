import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createDeliveryFixture, cleanupDeliveryFixtures } from './helpers/deliveryFixture';
import { PolicyStore, validatePolicy } from '../server/policy/settings';
import { DownloadQueue } from '../server/downloads/queue';
import { DownloadStore } from '../server/downloads/store';
import { openSource } from '../server/downloads/openSource';
import { DEFAULT_POLICY } from '../shared/policy';
import { validateDestination } from '../shared/jobOptions';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';

vi.mock('../server/downloads/openSource', () => ({ openSource: vi.fn() }));
const HASH = '0123456789abcdef0123456789abcdef01234567';
afterEach(async () => {
  await cleanupDeliveryFixtures();
  vi.restoreAllMocks();
  vi.mocked(openSource).mockReset();
});

it('migrates old preferences and preserves a saved destination when an older client omits the new field', async () => {
  const { directory } = await createDeliveryFixture();
  const { completionDirectory: _directory, ...legacy } = DEFAULT_POLICY;
  writeFileSync(path.join(directory, 'settings.json'), JSON.stringify(legacy));
  const store = new PolicyStore(directory);
  expect(store.settings.completionDirectory).toBeNull();
  store.update({ ...store.settings, completionDirectory: 'Media/Video' });
  store.update({ ...legacy, reserveGib: 0 });
  expect(new PolicyStore(directory).settings.completionDirectory).toBe('Media/Video');
  store.update({ ...store.settings, completionDirectory: null });
  expect(new PolicyStore(directory).settings.completionDirectory).toBeNull();
});

it('rejects unsafe folders without changing saved settings, and accepts the root marker', async () => {
  const { queue } = await createDeliveryFixture();
  queue.updateSettings({ ...DEFAULT_POLICY, completionDirectory: '.' });
  expect(validateDestination('.')).toBe('.');
  expect(validatePolicy({ ...DEFAULT_POLICY, completionDirectory: 'Cafe\u0301' }).completionDirectory).toBe('Café');
  for (const value of ['', '/home/pi/downloads', '..', '../escape', 'Movies/../escape', './Movies', {}, false]) {
    expect(() => queue.updateSettings({ ...DEFAULT_POLICY, completionDirectory: value })).toThrow();
    expect(queue.policy.settings.completionDirectory).toBe('.');
  }
});

it('inherits defaults for all job types and retains independent overrides', async () => {
  const { queue, directory } = await createDeliveryFixture();
  const older = queue.add('https://example.com/older');
  queue.updateSettings({ ...DEFAULT_POLICY, completionDirectory: 'Media' });
  const single = queue.add('https://example.com/one');
  const batch = queue.addBatch(['https://youtu.be/example', `magnet:?xt=urn:btih:${HASH}`]);
  const uploaded = queue.addTorrent(Buffer.from('d4:infod4:name4:testee').toString('base64'), 'test.torrent');
  expect(older.destination).toBeUndefined();
  for (const job of [single, ...batch.added, uploaded]) {
    expect(job.destination).toEqual({ directory: 'Media', moved: false, error: null });
  }
  queue.setDestination(single, 'Special');
  queue.setDestination(uploaded, null);
  queue.updateSettings({ ...queue.policy.settings, completionDirectory: 'Next' });
  expect(single.destination?.directory).toBe('Special');
  expect(uploaded.destination).toBeUndefined();
  expect(batch.added.every((job) => job.destination?.directory === 'Media')).toBe(true);
  expect(queue.add('https://example.com/next').destination?.directory).toBe('Next');
  const restored = new DownloadStore(directory);
  expect(restored.jobs.find((job) => job.id === single.id)?.destination?.directory).toBe('Special');
  expect(restored.jobs.find((job) => job.id === uploaded.id)?.destination).toBeUndefined();
  queue.updateSettings({ ...queue.policy.settings, completionDirectory: null });
  expect(queue.add('https://example.com/disabled').destination).toBeUndefined();
});

it('authenticates settings and moves a new download to the completion root', async () => {
  const { client, queue, configuration, login } = await createDeliveryFixture();
  const settings = { ...DEFAULT_POLICY, completionDirectory: '.' };
  await client.post(API_PATH.settings).send(settings).expect(HTTP_STATUS.unauthorized);
  await login();
  const saved = await client.post(API_PATH.settings).send(settings).expect(HTTP_STATUS.ok);
  expect(saved.body.completionDirectory).toBe('.');
  const submitted = await client.post(API_PATH.downloads).send({ url: 'https://example.com/movie.mp4' });
  expect(submitted.status).toBe(HTTP_STATUS.created);
  expect(submitted.body.destination.directory).toBe('.');
  const bytes = Buffer.from('downloaded video fixture');
  vi.mocked(openSource).mockResolvedValue(
    Object.assign(Readable.from([bytes]), { headers: {} }) as unknown as IncomingMessage,
  );
  const resumed = new DownloadQueue(configuration);
  try {
    const job = resumed.store.jobs[0]!;
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
    expect(job.destination?.moved).toBe(true);
    const output = path.join(queue.store.completedDirectory, job.id, 'files', 'movie.mp4');
    expect(readFileSync(output)).toEqual(bytes);
    expect(existsSync(queue.store.getFilePath(job.id))).toBe(false);
    expect(new DownloadStore(configuration.dataDirectory).jobs[0]?.destination?.moved).toBe(true);
    expect(openSource).toHaveBeenCalledTimes(1);
  } finally {
    await resumed.stop();
  }
});

it('does not reconnect an active source or rewrite its destination when only the global folder changes', async () => {
  const { configuration } = await createDeliveryFixture();
  const source = Object.assign(new PassThrough(), { headers: {} }) as unknown as IncomingMessage;
  vi.mocked(openSource).mockResolvedValue(source);
  const active = new DownloadQueue(configuration);
  try {
    const job = active.add('https://example.com/running');
    await vi.waitFor(() => expect(openSource).toHaveBeenCalledTimes(1));
    const [, signal] = vi.mocked(openSource).mock.calls[0]!;
    active.updateSettings({ ...active.policy.settings, completionDirectory: '.' });
    expect(signal.aborted).toBe(false);
    expect(job.destination).toBeUndefined();
    expect(source.destroyed).toBe(false);
    source.push('finished');
    source.push(null);
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
    expect(openSource).toHaveBeenCalledTimes(1);
  } finally {
    await active.stop();
  }
});
