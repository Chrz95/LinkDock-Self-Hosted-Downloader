import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOWNLOAD_STATUS } from '../shared/contracts';
import { DownloadQueue } from '../server/downloads/queue';
import { openSource } from '../server/downloads/openSource';
import type { ServerConfig } from '../server/config';
import { DEFAULT_POLICY } from '../shared/policy';
import { LIMIT } from '../server/constants';

/** HTTP range status used by continuation fixtures. */
const PARTIAL_STATUS = 206;

vi.mock('../server/downloads/openSource', () => ({ openSource: vi.fn() }));
const FILE_LIMIT_BYTES = 16;
const SERVICE_PORT = 8_080;
const directories: string[] = [];
const queues: DownloadQueue[] = [];

/**
 * Creates isolated on-disk state without touching a real station volume.
 * @param {number} [concurrency] - Allowed parallel jobs.
 * @returns {ServerConfig} Test configuration.
 */
export function createTestConfiguration(concurrency = 1): ServerConfig {
  const dataDirectory = mkdtempSync(path.resolve('tests/.queue-'));
  directories.push(dataDirectory);
  return {
    dataDirectory,
    accessToken: 'a-test-password-with-more-than-32-characters',
    port: SERVICE_PORT,
    concurrency,
    maximumFileBytes: FILE_LIMIT_BYTES,
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
}

/**
 * Tracks queue lifetimes so pending workers never outlive a test.
 * @param {ServerConfig} configuration - Isolated test settings.
 * @returns {DownloadQueue} Registered queue instance.
 */
function createTestQueue(configuration: ServerConfig): DownloadQueue {
  const queue = new DownloadQueue(configuration);
  queues.push(queue);
  return queue;
}

/**
 * Models an upstream response without relying on third-party availability.
 * @param {string} content - Bytes to stream.
 * @param {string} [contentLength] - Optional advertised response size.
 * @returns {IncomingMessage} Minimal compatible stream.
 */
function createSourceResponse(content: string, contentLength?: string): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(content)]), {
    headers: contentLength ? { 'content-length': contentLength } : {},
  }) as unknown as IncomingMessage;
}

beforeEach(() => vi.mocked(openSource).mockReset());
afterEach(
  /**
   * Cleans isolated test resources after the case finishes.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  async () => {
    await Promise.all(queues.splice(0).map((queue) => queue.stop()));
    await vi.waitFor(
      /**
       * Waits until asynchronous workers publish their terminal state.
       */
      () => {
        for (const directory of directories) {
          const historyPath = path.join(directory, 'history.json');
          if (existsSync(historyPath)) {
            const history = JSON.parse(readFileSync(historyPath, 'utf8')) as { status: string }[];
            expect(history.some((job) => job.status === DOWNLOAD_STATUS.downloading)).toBe(false);
          }
        }
      },
    );
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

/**
 * Groups behavior checks: persistent streaming queue.
 */
describe('persistent streaming queue', () => {
  /**
   * Verifies: stores complete bytes, reports completion and deletes file and history together.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('stores complete bytes, reports completion and deletes file and history together', async () => {
    vi.mocked(openSource).mockResolvedValue(createSourceResponse('hello', '5'));
    const queue = createTestQueue(createTestConfiguration());
    const job = queue.add('https://example.com/file.zip');
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
    expect(readFileSync(queue.store.getFilePath(job.id), 'utf8')).toBe('hello');
    expect(job.receivedBytes).toBe(Buffer.byteLength('hello'));
    expect(existsSync(queue.store.getFilePath(job.id, true))).toBe(false);
    queue.remove(job);
    expect(existsSync(queue.store.getFilePath(job.id))).toBe(false);
    expect(queue.store.jobs).toHaveLength(0);
  });
  /**
   * Verifies: enforces the byte limit even when Content-Length is absent and can retry a failure.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('enforces the byte limit even when Content-Length is absent and can retry a failure', async () => {
    vi.mocked(openSource)
      .mockResolvedValueOnce(createSourceResponse('x'.repeat(FILE_LIMIT_BYTES + 1)))
      .mockResolvedValueOnce(createSourceResponse('ok'));
    const queue = createTestQueue(createTestConfiguration());
    const job = queue.add('https://example.com/large.bin');
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.failed));
    expect(job.errorMessage).toContain('limit');
    expect(existsSync(queue.store.getFilePath(job.id, true))).toBe(false);
    queue.retry(job);
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
    expect(readFileSync(queue.store.getFilePath(job.id), 'utf8')).toBe('ok');
  });
  /**
   * Verifies: rejects an oversized advertised length before writing a file.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('rejects an oversized advertised length before writing a file', async () => {
    vi.mocked(openSource).mockResolvedValue(createSourceResponse('x', String(FILE_LIMIT_BYTES + 1)));
    const queue = createTestQueue(createTestConfiguration());
    const job = queue.add('https://example.com/large.bin');
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.failed));
    expect(existsSync(queue.store.getFilePath(job.id))).toBe(false);
  });
  /**
   * Verifies: respects concurrency and cancels an active stream before starting the next queued job.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('respects concurrency and cancels an active stream before starting the next queued job', async () => {
    const stalledSource = Object.assign(new PassThrough(), { headers: {} }) as unknown as IncomingMessage;
    vi.mocked(openSource).mockResolvedValueOnce(stalledSource).mockResolvedValueOnce(createSourceResponse('next'));
    const queue = createTestQueue(createTestConfiguration());
    const firstJob = queue.add('https://example.com/first');
    const secondJob = queue.add('https://example.com/second');
    expect(secondJob.status).toBe(DOWNLOAD_STATUS.queued);
    expect(openSource).toHaveBeenCalledTimes(1);
    queue.cancel(firstJob);
    await vi.waitFor(() => expect(secondJob.status).toBe(DOWNLOAD_STATUS.completed));
    expect(firstJob.status).toBe(DOWNLOAD_STATUS.cancelled);
    expect(existsSync(queue.store.getFilePath(firstJob.id, true))).toBe(false);
  });
  /**
   * Verifies automatic restart recovery uses actual partial bytes with a persisted strong validator.
   * @returns {Promise<void>} Completed recovered transfer.
   */
  it('resumes interrupted work automatically and removes unrelated orphan partials', async () => {
    const configuration = createTestConfiguration();
    const initialQueue = createTestQueue(configuration);
    await initialQueue.stop();
    const job = initialQueue.add('https://example.com/interrupted');
    job.status = DOWNLOAD_STATUS.downloading;
    job.resumeValidator = '"original"';
    job.resumeSourceUrl = job.url;
    const completeLength = 5;
    job.totalBytes = completeLength;
    initialQueue.store.save();
    writeFileSync(initialQueue.store.getFilePath(job.id, true), 'hel');
    const orphanPath = path.join(initialQueue.store.filesDirectory, 'orphan.part');
    writeFileSync(orphanPath, 'orphan');
    const remainder = createSourceResponse('lo', '2');
    remainder.statusCode = PARTIAL_STATUS;
    remainder.headers.etag = '"original"';
    remainder.headers['content-range'] = 'bytes 3-4/5';
    Object.assign(remainder, { sourceUrl: job.url });
    vi.mocked(openSource).mockResolvedValue(remainder);
    const recoveredQueue = createTestQueue(configuration);
    await vi.waitFor(() => expect(recoveredQueue.store.jobs[0]?.status).toBe(DOWNLOAD_STATUS.completed));
    expect(readFileSync(recoveredQueue.store.getFilePath(job.id), 'utf8')).toBe('hello');
    expect(openSource).toHaveBeenCalledWith(expect.any(URL), expect.any(AbortSignal), 0, {
      Range: 'bytes=3-',
      'If-Range': '"original"',
    });
    expect(existsSync(orphanPath)).toBe(false);
  });

  /**
   * Verifies manual suspension survives a station restart and releases the worker before resumption.
   * @returns {Promise<void>} Recovered transfer completes with the original bytes.
   */
  it('retains paused bytes across restarts and resumes only when requested', async () => {
    const upstream = Object.assign(new PassThrough(), {
      headers: { etag: '"original"', 'content-length': '5' },
      statusCode: 200,
      sourceUrl: 'https://example.com/paused',
    }) as unknown as IncomingMessage;
    vi.mocked(openSource).mockResolvedValueOnce(upstream);
    const configuration = createTestConfiguration();
    const queue = createTestQueue(configuration);
    const job = queue.add('https://example.com/paused');
    await vi.waitFor(() => expect(job.resumeValidator).toBe('"original"'));
    (upstream as unknown as PassThrough).write('hel');
    const partialLength = 3;
    await vi.waitFor(() => expect(job.receivedBytes).toBe(partialLength));
    await queue.pause(job);
    expect(readFileSync(queue.store.getFilePath(job.id, true), 'utf8')).toBe('hel');
    await queue.stop();
    const recovered = createTestQueue(configuration);
    const paused = recovered.store.jobs[0]!;
    expect(paused.status).toBe(DOWNLOAD_STATUS.paused);
    expect(openSource).toHaveBeenCalledTimes(1);
    const remainder = createSourceResponse('lo', '2');
    remainder.statusCode = PARTIAL_STATUS;
    remainder.headers.etag = '"original"';
    remainder.headers['content-range'] = 'bytes 3-4/5';
    Object.assign(remainder, { sourceUrl: paused.url });
    vi.mocked(openSource).mockResolvedValueOnce(remainder);
    recovered.resume(paused);
    await vi.waitFor(() => expect(paused.status).toBe(DOWNLOAD_STATUS.completed));
    expect(readFileSync(recovered.store.getFilePath(job.id), 'utf8')).toBe('hello');
  });

  /**
   * Verifies cancellation removes retained progress after a manual pause.
   * @returns {Promise<void>} Cancelled partial data is absent.
   */
  it('discards paused progress when cancelled and rejects duplicate resume requests', async () => {
    const upstream = Object.assign(new PassThrough(), { headers: {} }) as unknown as IncomingMessage;
    vi.mocked(openSource).mockResolvedValueOnce(upstream);
    const queue = createTestQueue(createTestConfiguration());
    const job = queue.add('https://example.com/paused');
    await queue.pause(job);
    expect(job.status).toBe(DOWNLOAD_STATUS.paused);
    queue.cancel(job);
    expect(existsSync(queue.store.getFilePath(job.id, true))).toBe(false);
    expect(() => queue.resume(job)).toThrow('pause');
  });

  /**
   * Verifies a closed time window holds waiting jobs and preference changes release eligible work.
   * @returns {Promise<void>} Job completes once the owner disables the schedule.
   */
  it('holds queued jobs outside the daily window and releases them when settings permit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    try {
      vi.mocked(openSource).mockResolvedValue(createSourceResponse('ok'));
      const queue = createTestQueue(createTestConfiguration());
      queue.updateSettings({
        ...DEFAULT_POLICY,
        scheduleEnabled: true,
        timeZone: 'UTC',
        windowStart: '01:00',
        windowEnd: '02:00',
      });
      const job = queue.add('https://example.com/overnight');
      expect(job.status).toBe(DOWNLOAD_STATUS.queued);
      expect(openSource).not.toHaveBeenCalled();
      expect(queue.snapshot().policy?.holdReason).toContain('01:00');
      queue.updateSettings({ ...DEFAULT_POLICY, scheduleEnabled: false });
      await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Verifies real filesystem space creates a temporary hold rather than a failed or deleted job.
   * @returns {Promise<void>} Job resumes when its free-space buffer is reduced.
   */
  it('holds work below the free-space buffer and resumes without deleting completed files', async () => {
    vi.mocked(openSource).mockResolvedValue(createSourceResponse('ok'));
    const queue = createTestQueue(createTestConfiguration());
    const unavailableReserve = Math.ceil(queue.snapshot().storage.availableBytes / LIMIT.bytesPerGibibyte) + 1;
    queue.updateSettings({ ...DEFAULT_POLICY, reserveGib: unavailableReserve });
    const job = queue.add('https://example.com/disk');
    expect(job.status).toBe(DOWNLOAD_STATUS.queued);
    expect(queue.snapshot().policy?.holdReason).toContain('disk space');
    queue.updateSettings({ ...DEFAULT_POLICY, reserveGib: 0 });
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
    expect(readFileSync(queue.store.getFilePath(job.id), 'utf8')).toBe('ok');
  });
});
