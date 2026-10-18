import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadQueue } from '../server/downloads/queue';
import { DownloadStore } from '../server/downloads/store';
import { reviewBatch, createQueuedJob } from '../server/downloads/batch';
import { resolveDownloadRequest } from '../server/engines/detectSource';
import { openSource } from '../server/downloads/openSource';
import { JOB_PRIORITY, MAXIMUM_BATCH_LINKS, getQueueOrder } from '../shared/batch';
import { DOWNLOAD_STATUS } from '../shared/contracts';
import type { ServerConfig } from '../server/config';

vi.mock('../server/downloads/openSource', () => ({ openSource: vi.fn() }));
const PORT = 8_080;
const FILE_LIMIT = 1_024;
const resources: { queue: DownloadQueue; directory: string }[] = [];
/** Creates an isolated station. @returns {DownloadQueue} Queue owned by this test. */
function createQueue(): DownloadQueue {
  const directory = mkdtempSync(path.resolve('tests/.batch-'));
  const configuration: ServerConfig = {
    dataDirectory: directory,
    port: PORT,
    accessToken: 'test-password-at-least-32-characters',
    concurrency: 1,
    maximumFileBytes: FILE_LIMIT,
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
  const queue = new DownloadQueue(configuration);
  resources.push({ queue, directory });
  return queue;
}
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.queue.stop();
    rmSync(resource.directory, { recursive: true, force: true });
  }
  vi.mocked(openSource).mockReset();
});

it('reviews without mutation, skips duplicates and commits an entire valid batch together', async () => {
  const queue = createQueue();
  await queue.stop();
  const urls = ['https://example.com/a#one', 'https://example.com/a#two', 'https://example.com/b'];
  const twoJobs = 2;
  expect(queue.previewBatch(urls)).toEqual({ newCount: twoJobs, duplicates: ['https://example.com/a'] });
  expect(queue.store.jobs).toHaveLength(0);
  const result = queue.addBatch(urls);
  expect(result.added).toHaveLength(twoJobs);
  expect(getQueueOrder(queue.store.jobs).map((job) => job.url)).toEqual([
    'https://example.com/a',
    'https://example.com/b',
  ]);
  expect(queue.addBatch(urls).added).toHaveLength(0);
  expect(openSource).not.toHaveBeenCalled();
});

it('rejects any invalid link or oversized batch before changing history', async () => {
  const queue = createQueue();
  await queue.stop();
  expect(() => queue.addBatch(['https://example.com/good', 'file:///private'])).toThrow('Link 2');
  expect(() =>
    queue.addBatch(Array.from({ length: MAXIMUM_BATCH_LINKS + 1 }, () => 'https://example.com/a')),
  ).toThrow();
  expect(queue.store.jobs).toHaveLength(0);
});

it('rolls back in-memory batch acceptance if the atomic history write fails', async () => {
  const queue = createQueue();
  await queue.stop();
  vi.spyOn(queue.store, 'save').mockImplementationOnce(() => {
    throw new Error('Simulated disk failure');
  });
  expect(() => queue.addBatch(['https://example.com/a', 'https://example.com/b'])).toThrow('disk failure');
  expect(queue.store.jobs).toHaveLength(0);
  expect(JSON.parse(readFileSync(path.join(resources[0]!.directory, 'history.json'), 'utf8'))).toEqual([]);
  expect(openSource).not.toHaveBeenCalled();
});

it('deduplicates equivalent magnet hashes and preserves distinct signed HTTP queries or video qualities', () => {
  const hashLength = 40;
  const encodedHashLength = 32;
  const hash = '0'.repeat(hashLength);
  const encodedHash = 'A'.repeat(encodedHashLength);
  const magnets = reviewBatch(
    [`magnet:?xt=urn:btih:${hash}&dn=A`, `magnet:?xt=urn:btih:${encodedHash}&dn=B`],
    undefined,
    undefined,
    [],
  );
  expect(magnets.unique).toHaveLength(1);
  const video = createQueuedJob(resolveDownloadRequest('https://youtube.com/watch?v=x', 'video', '720'));
  expect(reviewBatch([video.url], 'video', '1080', [video]).unique).toHaveLength(1);
  const queries = ['https://example.com/file?sig=a', 'https://example.com/file?sig=b'];
  const twoJobs = 2;
  expect(reviewBatch(queries, undefined, undefined, []).unique).toHaveLength(twoJobs);
});

it('uses FIFO within priorities and never preempts a running transfer', async () => {
  const blocked = Object.assign(new PassThrough(), { headers: {} }) as unknown as IncomingMessage;
  vi.mocked(openSource)
    .mockResolvedValueOnce(blocked)
    .mockImplementation(
      async () => Object.assign(Readable.from([Buffer.from('done')]), { headers: {} }) as unknown as IncomingMessage,
    );
  const queue = createQueue();
  const active = queue.add('https://example.com/running');
  const batch = queue.addBatch(['https://example.com/normal', 'https://example.com/low', 'https://example.com/high']);
  const [normal, low, high] = batch.added;
  queue.setPriority(low!, JOB_PRIORITY.low);
  queue.setPriority(high!, JOB_PRIORITY.high);
  expect(active.status).toBe(DOWNLOAD_STATUS.downloading);
  expect(openSource).toHaveBeenCalledTimes(1);
  expect(() => queue.setPriority(active, JOB_PRIORITY.high)).toThrow('waiting');
  (blocked as unknown as PassThrough).end('ready');
  await vi.waitFor(() => expect(batch.added.every((job) => job.status === DOWNLOAD_STATUS.completed)).toBe(true));
  expect(vi.mocked(openSource).mock.calls.map((call) => call[0].href)).toEqual([
    active.url,
    high!.url,
    normal!.url,
    low!.url,
  ]);
});

it('persists priority without releasing manual pauses and rolls back a failed priority write', async () => {
  const queue = createQueue();
  await queue.stop();
  const job = queue.add('https://example.com/waiting');
  await queue.pause(job);
  queue.setPriority(job, JOB_PRIORITY.high);
  const restored = new DownloadStore(resources[0]!.directory).jobs[0]!;
  expect(restored).toMatchObject({ status: DOWNLOAD_STATUS.paused, priority: JOB_PRIORITY.high });
  vi.spyOn(queue.store, 'save').mockImplementationOnce(() => {
    throw new Error('Disk full');
  });
  expect(() => queue.setPriority(job, JOB_PRIORITY.low)).toThrow('Disk full');
  expect(job.priority).toBe(JOB_PRIORITY.high);
});

it('announces terminal transitions only after saving and supports removing an observer', async () => {
  vi.mocked(openSource).mockImplementation(
    async () => Object.assign(Readable.from([Buffer.from('done')]), { headers: {} }) as unknown as IncomingMessage,
  );
  const queue = createQueue();
  const observed = vi.fn((job) => {
    const history = JSON.parse(readFileSync(path.join(resources[0]!.directory, 'history.json'), 'utf8'));
    expect(history.find((entry: { id: string }) => entry.id === job.id).status).toBe(DOWNLOAD_STATUS.completed);
  });
  const unsubscribe = queue.onTerminal(observed);
  const jobs = queue.addBatch(['https://example.com/first', 'https://example.com/second']).added;
  const twoJobs = 2;
  await vi.waitFor(() => expect(observed).toHaveBeenCalledTimes(twoJobs));
  expect(jobs.every((job) => job.status === DOWNLOAD_STATUS.completed)).toBe(true);
  unsubscribe();
  const next = queue.add('https://example.com/third');
  await vi.waitFor(() => expect(next.status).toBe(DOWNLOAD_STATUS.completed));
  expect(observed).toHaveBeenCalledTimes(twoJobs);
});
