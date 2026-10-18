import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { validateLibraryMetadata, LIBRARY_LIMIT, LIBRARY_FILTER } from '../shared/library';
import { DownloadQueue } from '../server/downloads/queue';
import { DownloadStore } from '../server/downloads/store';
import { validateHistory } from '../server/downloads/validateHistory';
import { DOWNLOAD_STATUS } from '../shared/contracts';
import { getLibraryOptions, matchesLibrary } from '../src/features/downloads/utils/libraryView';
import type { ServerConfig } from '../server/config';

const PORT = 8_080;
const FILE_LIMIT = 1_024;
const resources: { queue: DownloadQueue; directory: string }[] = [];
/** Creates a stopped queue with isolated real persistence. @returns {Promise<DownloadQueue>} Test-owned queue. */
async function createQueue(): Promise<DownloadQueue> {
  const directory = mkdtempSync(path.resolve('tests/.library-'));
  const configuration: ServerConfig = {
    port: PORT,
    dataDirectory: directory,
    accessToken: 'test-password-at-least-32-characters',
    concurrency: 1,
    maximumFileBytes: FILE_LIMIT,
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
  const queue = new DownloadQueue(configuration);
  resources.push({ queue, directory });
  await queue.stop();
  return queue;
}
afterEach(async () => {
  for (const { queue, directory } of resources.splice(0)) {
    await queue.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('normalizes Unicode labels and deduplicates tags case-insensitively while preserving display spelling', () => {
  expect(validateLibraryMetadata({ folder: '  Summer   trips ', tags: [' Travel ', 'travel', 'Cafe\u0301'] })).toEqual({
    folder: 'Summer trips',
    tags: ['Travel', 'Café'],
  });
  expect(validateLibraryMetadata({ folder: '', tags: [] })).toEqual({ folder: '', tags: [] });
});

it.each([
  null,
  {},
  { folder: '../outside', tags: [] },
  { folder: '.', tags: [] },
  { folder: 'a\\b', tags: [] },
  { folder: 'bad\nlabel', tags: [] },
  { folder: 'x'.repeat(LIBRARY_LIMIT.folderCharacters + 1), tags: [] },
  { folder: '', tags: ['a,b'] },
  { folder: '', tags: [''] },
  { folder: '', tags: [1] },
  { folder: '', tags: ['x'.repeat(LIBRARY_LIMIT.tagCharacters + 1)] },
  { folder: '', tags: Array.from({ length: LIBRARY_LIMIT.tags + 1 }, () => 'tag') },
])('rejects a malformed, oversized or path-like organization edit %#', (input) => {
  expect(() => validateLibraryMetadata(input)).toThrow();
});

it('persists organization across restarts without changing bytes, filenames or transfer state', async () => {
  const queue = await createQueue();
  const job = queue.add('https://example.com/archive.zip');
  job.status = DOWNLOAD_STATUS.completed;
  writeFileSync(queue.store.getFilePath(job.id), 'original bytes');
  queue.organize(job, { folder: 'Backups', tags: ['Keep', 'keep'] });
  const restored = new DownloadStore(resources[0]!.directory).jobs[0]!;
  expect(restored).toMatchObject({
    filename: 'archive.zip',
    status: DOWNLOAD_STATUS.completed,
    library: { folder: 'Backups', tags: ['Keep'] },
  });
  expect(readFileSync(queue.store.getFilePath(job.id), 'utf8')).toBe('original bytes');
  expect(() => validateHistory([{ ...restored, library: { folder: '../bad', tags: [] } }])).toThrow('History');
  expect(() => validateHistory([{ ...restored, library: { folder: 'Backups', tags: ['Keep', 'keep'] } }])).toThrow();
});

it('keeps old labels in memory and on disk after invalid input or a failed write', async () => {
  const queue = await createQueue();
  const job = queue.add('https://example.com/a');
  queue.organize(job, { folder: 'Original', tags: ['Keep'] });
  expect(() => queue.organize(job, { folder: 'Next', tags: ['bad/tag'] })).toThrow();
  vi.spyOn(queue.store, 'save').mockImplementationOnce(() => {
    throw new Error('Disk full');
  });
  expect(() => queue.organize(job, { folder: 'Next', tags: [] })).toThrow('Disk full');
  expect(job.library).toEqual({ folder: 'Original', tags: ['Keep'] });
  expect(new DownloadStore(resources[0]!.directory).jobs[0]!.library).toEqual(job.library);
  queue.organize(job, { folder: '', tags: [] });
  expect(new DownloadStore(resources[0]!.directory).jobs[0]!.library).toEqual({ folder: '', tags: [] });
});

it('combines exact folder selection with case-insensitive tags and filename or label search', async () => {
  const queue = await createQueue();
  const job = queue.add('https://example.com/clip.mp4');
  queue.organize(job, { folder: 'unfiled', tags: ['Travel'] });
  expect(matchesLibrary(job, 'CLIP', `${LIBRARY_FILTER.folderPrefix}unfiled`, 'travel')).toBe(true);
  expect(matchesLibrary(job, 'travel', '', '')).toBe(true);
  expect(matchesLibrary(job, 'unfiled', '', '')).toBe(true);
  expect(matchesLibrary(job, '', LIBRARY_FILTER.unfiled, '')).toBe(false);
  expect(matchesLibrary(job, 'other', '', '')).toBe(false);
  expect(matchesLibrary(job, '', '', 'other')).toBe(false);
  const options = getLibraryOptions([job], `${LIBRARY_FILTER.folderPrefix}Removed`, 'missing');
  expect(options.folders).toContain('Removed');
  expect(options.tags).toContainEqual(['travel', 'Travel']);
  expect(options.tags).toContainEqual(['missing', 'missing']);
});
