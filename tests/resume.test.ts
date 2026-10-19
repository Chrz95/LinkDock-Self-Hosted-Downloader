import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, IncomingHttpHeaders } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DownloadStore } from '../server/downloads/store';
import { transferToDisk } from '../server/downloads/transfer';
import { openSource } from '../server/downloads/openSource';
import { DOWNLOAD_STATUS, HTTP_STATUS, type DownloadJob } from '../shared/contracts';
import { waitForBandwidth } from '../server/downloads/transferPolicy';

vi.mock('../server/downloads/openSource', () => ({ openSource: vi.fn() }));
const FILE_LIMIT = 1_024;
const COMPLETE_LENGTH = 5;
const PARTIAL_STATUS = 206;
const UNSATISFIABLE_STATUS = 416;
const RATE_BYTES = 100;
const MILLISECONDS = 1_000;
const directories: string[] = [];
/**
 * Provides an actual readable stream with HTTP metadata for deterministic range responses.
 * @param {string} body - Response bytes.
 * @param {IncomingHttpHeaders} [headers] - Representation and range metadata.
 * @param {number} [statusCode] - HTTP status.
 * @returns {IncomingMessage} Readable source fixture.
 */
function response(
  body: string,
  headers: IncomingHttpHeaders = {},
  statusCode: number = HTTP_STATUS.ok,
): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(body)]), {
    headers,
    statusCode,
    sourceUrl: 'https://example.com/file',
  }) as unknown as IncomingMessage;
}
/**
 * Creates a persisted partial file with an entity validator and a deliberately stale progress count.
 * @returns {object} Isolated store and live record.
 */
function partialTransfer() {
  const directory = mkdtempSync(path.resolve('tests/.resume-'));
  directories.push(directory);
  const store = new DownloadStore(directory);
  const job: DownloadJob = {
    id: '2973533c-346f-49cf-9c9e-378378d820f8',
    url: 'https://example.com/file',
    filename: 'file',
    status: DOWNLOAD_STATUS.downloading,
    receivedBytes: 0,
    totalBytes: COMPLETE_LENGTH,
    bytesPerSecond: 0,
    createdAt: '',
    finishedAt: null,
    errorMessage: null,
    resumeValidator: '"stable"',
    resumeSourceUrl: 'https://example.com/file',
  };
  writeFileSync(store.getFilePath(job.id, true), 'hel');
  return { store, job };
}
beforeEach(() => vi.mocked(openSource).mockReset());
afterEach(() => {
  vi.useRealTimers();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('appends only a matching strong entity and derives the offset from actual disk bytes', async () => {
  const { store, job } = partialTransfer();
  vi.mocked(openSource).mockResolvedValue(
    response(
      'lo',
      {
        etag: '"stable"',
        'content-range': 'bytes 3-4/5',
        'content-length': '2',
      },
      PARTIAL_STATUS,
    ),
  );
  await transferToDisk(job, store, new AbortController().signal, FILE_LIMIT);
  expect(readFileSync(store.getFilePath(job.id), 'utf8')).toBe('hello');
  expect(openSource).toHaveBeenCalledWith(
    expect.any(URL),
    expect.any(AbortSignal),
    0,
    {
      Range: 'bytes=3-',
      'If-Range': '"stable"',
    },
    expect.objectContaining({ cookies: [], onWait: expect.any(Function) }),
  );
});

it('truncates previous bytes when a server ignores Range or the entity has changed', async () => {
  const { store, job } = partialTransfer();
  vi.mocked(openSource).mockResolvedValue(response('world', { etag: '"changed"', 'content-length': '5' }));
  await transferToDisk(job, store, new AbortController().signal, FILE_LIMIT);
  expect(readFileSync(store.getFilePath(job.id), 'utf8')).toBe('world');
});

it('does not reuse a matching entity tag after the final redirected resource changes', async () => {
  const { store, job } = partialTransfer();
  job.resumeSourceUrl = 'https://example.com/previous-cdn-file';
  vi.mocked(openSource)
    .mockResolvedValueOnce(
      response(
        'lo',
        {
          etag: '"stable"',
          'content-range': 'bytes 3-4/5',
          'content-length': '2',
        },
        PARTIAL_STATUS,
      ),
    )
    .mockResolvedValueOnce(response('fresh'));
  await transferToDisk(job, store, new AbortController().signal, FILE_LIMIT);
  expect(readFileSync(store.getFilePath(job.id), 'utf8')).toBe('fresh');
});

it.each([
  { etag: '"different"', 'content-range': 'bytes 3-4/5' },
  { etag: '"stable"', 'content-range': 'bytes 2-4/5' },
  { etag: '"stable"', 'content-range': 'bytes 3-5/6' },
  { etag: 'W/"stable"', 'content-range': 'bytes 3-4/5' },
])('restarts safely instead of appending an inconsistent response: %j', async (headers) => {
  const { store, job } = partialTransfer();
  vi.mocked(openSource)
    .mockResolvedValueOnce(response('bad', headers, PARTIAL_STATUS))
    .mockResolvedValueOnce(response('fresh'));
  await transferToDisk(job, store, new AbortController().signal, FILE_LIMIT);
  expect(readFileSync(store.getFilePath(job.id), 'utf8')).toBe('fresh');
});

it('restarts an unsatisfiable range without publishing its error response', async () => {
  const { store, job } = partialTransfer();
  vi.mocked(openSource)
    .mockResolvedValueOnce(response('error page', {}, UNSATISFIABLE_STATUS))
    .mockResolvedValueOnce(response('fresh'));
  await transferToDisk(job, store, new AbortController().signal, FILE_LIMIT);
  expect(readFileSync(store.getFilePath(job.id), 'utf8')).toBe('fresh');
});

it('starts over without a strong validator and rejects premature EOF before publication', async () => {
  const { store, job } = partialTransfer();
  job.resumeValidator = undefined;
  vi.mocked(openSource).mockResolvedValue(response('short', { 'content-length': String(FILE_LIMIT) }));
  await expect(transferToDisk(job, store, new AbortController().signal, FILE_LIMIT)).rejects.toThrow('declared');
  expect(openSource).toHaveBeenCalledWith(
    expect.any(URL),
    expect.any(AbortSignal),
    0,
    {},
    expect.objectContaining({ cookies: [], onWait: expect.any(Function) }),
  );
  expect(existsSync(store.getFilePath(job.id))).toBe(false);
  expect(existsSync(store.getFilePath(job.id, true))).toBe(false);
});

it('rejects a browser challenge webpage before publishing it as a downloaded file', async () => {
  const { store, job } = partialTransfer();
  job.resumeValidator = undefined;
  vi.mocked(openSource).mockResolvedValue(
    response('<html>Verify you are human</html>', { 'content-type': 'text/html' }),
  );
  await expect(transferToDisk(job, store, new AbortController().signal, FILE_LIMIT)).rejects.toThrow(
    'Browser assistance',
  );
  expect(existsSync(store.getFilePath(job.id))).toBe(false);
});

it('enforces rate pacing and aborts promptly while waiting for bandwidth', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let isReady = false;
  const paced = waitForBandwidth(RATE_BYTES, Date.now(), RATE_BYTES, controller.signal).then(() => {
    isReady = true;
  });
  await vi.advanceTimersByTimeAsync(MILLISECONDS - 1);
  expect(isReady).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await paced;
  expect(isReady).toBe(true);
  const interrupted = waitForBandwidth(RATE_BYTES, Date.now(), RATE_BYTES, controller.signal);
  const rejection = expect(interrupted).rejects.toThrow();
  controller.abort();
  await rejection;
});
