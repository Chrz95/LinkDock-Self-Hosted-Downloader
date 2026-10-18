import { mkdtempSync, rmSync, statfsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadQueue } from '../server/downloads/queue';
import { openSource } from '../server/downloads/openSource';
import { DEFAULT_POLICY } from '../shared/policy';
import { DOWNLOAD_STATUS } from '../shared/contracts';

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, statfsSync: vi.fn(original.statfsSync) };
});
vi.mock('../server/downloads/openSource', () => ({ openSource: vi.fn() }));
const INITIAL_FREE_BYTES = 10;
const RELEASED_FREE_BYTES = 30;
const FILE_BYTES = 20;
const FILE_LIMIT = 1_024;
const PORT = 8_080;
const DIRECTORY_PREFIX = 'tests/.storage-';
let queue: DownloadQueue | undefined;
let directory: string | undefined;
afterEach(async () => {
  await queue?.stop();
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * Guards the low-space edge where free bytes exceed the reserve but cannot accommodate the pending chunk.
 * @returns {Promise<void>} One held transfer resumes only after enough space is available.
 */
it('avoids a rapid restart loop when the pending chunk does not fit above the free-space floor', async () => {
  directory = mkdtempSync(path.resolve(DIRECTORY_PREFIX));
  const capacity = statfsSync(directory);
  vi.mocked(statfsSync).mockReturnValue({ ...capacity, bsize: 1, bavail: INITIAL_FREE_BYTES });
  vi.mocked(openSource).mockImplementation(
    async () =>
      Object.assign(Readable.from([Buffer.alloc(FILE_BYTES)]), {
        headers: {},
        sourceUrl: 'https://example.com/file',
      }) as unknown as IncomingMessage,
  );
  queue = new DownloadQueue({
    dataDirectory: directory,
    accessToken: 'a-test-password-with-at-least-32-characters',
    port: PORT,
    concurrency: 1,
    maximumFileBytes: FILE_LIMIT,
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  });
  queue.updateSettings({ ...DEFAULT_POLICY, reserveGib: 0 });
  const job = queue.add('https://example.com/file');
  await vi.waitFor(() => expect(queue?.snapshot().policy?.holdReason).toContain('disk space'));
  expect(job.status).toBe(DOWNLOAD_STATUS.queued);
  queue.schedule();
  queue.schedule();
  expect(openSource).toHaveBeenCalledTimes(1);
  vi.mocked(statfsSync).mockReturnValue({ ...capacity, bsize: 1, bavail: RELEASED_FREE_BYTES });
  queue.schedule();
  await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
  expect(readFileSync(queue.store.getFilePath(job.id))).toHaveLength(FILE_BYTES);
});
