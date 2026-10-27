import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadQueue } from '../server/downloads/queue';
import { openSource } from '../server/downloads/openSource';
import { DOWNLOAD_STATUS } from '../shared/contracts';
import { DOWNLOAD_RETRY } from '../shared/downloadRetry';
import { DEFAULT_POLICY } from '../shared/policy';
import type { ServerConfig } from '../server/config';
import { logger } from '../src/lib/logger/logger';

vi.mock('../server/downloads/openSource', () => ({ openSource: vi.fn() }));
const resources: { queue: DownloadQueue; directory: string }[] = [];
const PORT = 8_080;
const SIZE_LIMIT = 1_024;
const PARTIAL = 206;
const COMPLETE = 200;
const TWO_CALLS = 2;

/** Starts isolated real queue/storage logic with a controlled clock and no external network.
 * @returns {object} Queue, durable state and virtual time advance helper.
 */
function fixture() {
  const directory = mkdtempSync(path.resolve('tests/.automatic-retry-'));
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const configuration: ServerConfig = {
    dataDirectory: directory,
    port: PORT,
    accessToken: 'automatic-retry-test-password-at-least-32',
    concurrency: 1,
    maximumFileBytes: SIZE_LIMIT,
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
  const queue = new DownloadQueue(configuration);
  resources.push({ queue, directory });
  queue.updateSettings({ ...DEFAULT_POLICY, reserveGib: 0 });
  /** Advances only wall-clock eligibility, keeping I/O and worker cleanup on real timers.
   * @param {number} next - Absolute virtual wall-clock time.
   */
  function advance(next: number): void {
    now = next;
  }
  return { queue, directory, configuration, advance };
}
/** Creates a successful actual stream; no downloader implementation is duplicated.
 * @param {string} text - Response bytes.
 * @returns {IncomingMessage} Streaming fixture response.
 */
function response(text: string): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(text)]), { headers: {}, statusCode: COMPLETE }) as IncomingMessage;
}
afterEach(async () => {
  const current = resources.splice(0);
  await Promise.all(current.map(({ queue }) => queue.stop()));
  for (const directory of new Set(current.map((entry) => entry.directory))) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.mocked(openSource).mockReset();
});

it('backs off persistently, releases the slot and holds queued jobs from the same host only', async () => {
  vi.mocked(openSource)
    .mockRejectedValueOnce(Object.assign(new Error('private-native-error'), { code: 'ECONNRESET' }))
    .mockResolvedValue(response('other'));
  const { queue, directory, advance } = fixture();
  const job = queue.add('https://source.example/first');
  await vi.waitFor(() => expect(job.retry?.attempts).toBe(1));
  await vi.waitFor(() =>
    expect(JSON.parse(readFileSync(path.join(directory, 'history.json'), 'utf8'))[0].retry).toBeTruthy(),
  );
  expect(job.status).toBe(DOWNLOAD_STATUS.queued);
  expect(job.finishedAt).toBeNull();
  expect(job.errorMessage).toBeNull();
  expect(JSON.stringify(job.retry)).not.toContain('private-native-error');
  const same = queue.add('https://source.example/second');
  const other = queue.add('https://other.example/file');
  await vi.waitFor(() => expect(other.status).toBe(DOWNLOAD_STATUS.completed));
  expect(same.status).toBe(DOWNLOAD_STATUS.queued);
  expect(same.stage).toBe('Waiting for source cooldown');
  advance(Date.parse(job.retry!.nextAttemptAt!) - 1);
  queue.schedule();
  expect(openSource).toHaveBeenCalledTimes(TWO_CALLS);
});

it('resumes retained bytes with the original strong validator after a delayed reset retry', async () => {
  const url = 'https://source.example/file';
  const source = Object.assign(new PassThrough(), {
    headers: { etag: '"stable"', 'content-length': '5' },
    statusCode: COMPLETE,
    sourceUrl: url,
  });
  vi.mocked(openSource).mockResolvedValueOnce(source as unknown as IncomingMessage);
  const { queue, advance } = fixture();
  const job = queue.add(url);
  await vi.waitFor(() => expect(job.resumeValidator).toBe('"stable"'));
  source.write('hel');
  const partialBytes = 3;
  await vi.waitFor(() => expect(job.receivedBytes).toBe(partialBytes));
  source.destroy(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
  await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.queued));
  expect(readFileSync(queue.store.getFilePath(job.id, true), 'utf8')).toBe('hel');
  const remainder = response('lo');
  Object.assign(remainder, { statusCode: PARTIAL, sourceUrl: url });
  Object.assign(remainder.headers, { etag: '"stable"', 'content-length': '2', 'content-range': 'bytes 3-4/5' });
  vi.mocked(openSource).mockResolvedValueOnce(remainder);
  advance(Date.parse(job.retry!.nextAttemptAt!));
  queue.schedule();
  await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
  expect(readFileSync(queue.store.getFilePath(job.id), 'utf8')).toBe('hello');
  expect(openSource).toHaveBeenLastCalledWith(
    expect.any(URL),
    expect.any(AbortSignal),
    0,
    { Range: 'bytes=3-', 'If-Range': '"stable"' },
    expect.objectContaining({ deferRetries: true }),
  );
});

it('stops after three automatic attempts and emits just one final failure notification', async () => {
  vi.mocked(openSource).mockRejectedValue(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
  const { queue, advance } = fixture();
  const terminal = vi.fn();
  queue.onTerminal(terminal);
  const job = queue.add('https://source.example/file');
  for (let index = 0; index < DOWNLOAD_RETRY.maximumAttempts; index += 1) {
    await vi.waitFor(() => expect(job.retry?.attempts).toBe(index + 1));
    expect(terminal).not.toHaveBeenCalled();
    expect(Date.parse(job.retry!.nextAttemptAt!) - Date.now()).toBe(DOWNLOAD_RETRY.delaysMilliseconds[index]);
    advance(Date.parse(job.retry!.nextAttemptAt!));
    queue.schedule();
  }
  await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.failed));
  expect(openSource).toHaveBeenCalledTimes(1 + DOWNLOAD_RETRY.maximumAttempts);
  expect(terminal).toHaveBeenCalledOnce();
  expect(job.retry?.nextAttemptAt).toBeNull();
});

it('restores the remaining delay and attempt budget across a station restart', async () => {
  vi.mocked(openSource).mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
  const { queue, directory, configuration, advance } = fixture();
  const original = queue.add('https://source.example/file');
  await vi.waitFor(() => expect(original.retry?.nextAttemptAt).toBeTruthy());
  await queue.stop();
  const restored = new DownloadQueue(configuration);
  resources.push({ queue: restored, directory });
  const job = restored.store.jobs[0]!;
  expect(job.retry).toEqual(original.retry);
  expect(openSource).toHaveBeenCalledOnce();
  vi.mocked(openSource).mockResolvedValue(response('done'));
  advance(Date.parse(job.retry!.nextAttemptAt!));
  restored.schedule();
  await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
  expect(job.retry?.attempts).toBe(1);
});

it('keeps pause/cancel authoritative and preserves source cooldown when a waiting job is cancelled', async () => {
  vi.mocked(openSource).mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
  const { queue, advance } = fixture();
  const job = queue.add('https://source.example/file');
  await vi.waitFor(() => expect(job.retry?.nextAttemptAt).toBeTruthy());
  await queue.pause(job);
  queue.schedule();
  expect(job.status).toBe(DOWNLOAD_STATUS.paused);
  queue.cancel(job);
  const next = queue.add('https://source.example/new-file');
  expect(next.status).toBe(DOWNLOAD_STATUS.queued);
  expect(openSource).toHaveBeenCalledOnce();
  vi.mocked(openSource).mockResolvedValue(response('new'));
  advance(Date.parse(job.retry!.cooldownUntil));
  queue.schedule();
  await vi.waitFor(() => expect(next.status).toBe(DOWNLOAD_STATUS.completed));
  expect(job.status).toBe(DOWNLOAD_STATUS.cancelled);
});

it('pauses scheduled retries when disabled and lets the owner resume manually after the cooldown', async () => {
  vi.mocked(openSource).mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
  const { queue, advance } = fixture();
  const job = queue.add('https://source.example/file');
  await vi.waitFor(() => expect(job.retry?.nextAttemptAt).toBeTruthy());
  queue.updateSettings({ ...DEFAULT_POLICY, reserveGib: 0, automaticRetries: false });
  expect(job.status).toBe(DOWNLOAD_STATUS.paused);
  advance(Date.parse(job.retry!.cooldownUntil));
  queue.schedule();
  expect(openSource).toHaveBeenCalledOnce();
  vi.mocked(openSource).mockResolvedValue(response('done'));
  queue.resume(job);
  await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
});

it('honors a disabled preference when restoring a previously scheduled retry', async () => {
  vi.mocked(openSource).mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
  const { queue, directory, configuration } = fixture();
  const original = queue.add('https://source.example/file');
  await vi.waitFor(() => expect(original.retry?.nextAttemptAt).toBeTruthy());
  await queue.stop();
  writeFileSync(
    path.join(directory, 'settings.json'),
    JSON.stringify({ ...DEFAULT_POLICY, reserveGib: 0, automaticRetries: false }),
  );
  const restored = new DownloadQueue(configuration);
  resources.push({ queue: restored, directory });
  expect(restored.store.jobs[0]?.status).toBe(DOWNLOAD_STATUS.paused);
  expect(restored.store.jobs[0]?.retry?.nextAttemptAt).toBeNull();
  expect(openSource).toHaveBeenCalledOnce();
});

it('stops the automatic retry when its durable decision cannot be saved', async () => {
  let rejectSource: ((error: Error) => void) | undefined;
  vi.mocked(openSource).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectSource = reject;
      }),
  );
  const { queue, advance } = fixture();
  const job = queue.add('https://source.example/file');
  await vi.waitFor(() => expect(rejectSource).toBeDefined());
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  const save = vi.spyOn(queue.store, 'save').mockImplementation(() => {
    throw new Error('disk unavailable');
  });
  rejectSource!(Object.assign(new Error('reset'), { code: 'ECONNRESET' }));
  await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.paused));
  expect(job.stage).toContain('could not be saved');
  advance(Date.parse(job.retry!.cooldownUntil));
  queue.schedule();
  expect(openSource).toHaveBeenCalledOnce();
  save.mockRestore();
});

it('does not reconnect an active download when only the automatic retry preference changes', async () => {
  const source = Object.assign(new PassThrough(), { headers: {}, statusCode: COMPLETE });
  vi.mocked(openSource).mockResolvedValue(source as unknown as IncomingMessage);
  const { queue } = fixture();
  const job = queue.add('https://source.example/file');
  await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.downloading));
  queue.updateSettings({ ...queue.policy.settings, automaticRetries: false });
  expect(job.status).toBe(DOWNLOAD_STATUS.downloading);
  expect(source.destroyed).toBe(false);
  source.end('done');
  await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
  expect(openSource).toHaveBeenCalledOnce();
});
