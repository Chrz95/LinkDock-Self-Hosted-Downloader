import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { transferExternal } from '../server/engines/transferExternal';
import { downloadTorrent } from '../server/engines/torrent/downloadTorrent';
import { TorrentRpc } from '../server/engines/torrent/rpc';
import { DownloadStore } from '../server/downloads/store';
import type { DownloadJob } from '../shared/contracts';
import { SOURCE_TYPE } from '../shared/sources';
import type { ServerConfig } from '../server/config';

vi.mock('../server/engines/torrent/downloadTorrent', () => ({ downloadTorrent: vi.fn() }));
const directories: string[] = [];
const SIZE = 3;
const PORT = 8_080;
afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  vi.resetAllMocks();
});
it('publishes only approved files and removes unselected piece fragments and torrent bookkeeping', async () => {
  const directory = mkdtempSync(path.resolve('tests/.torrent-output-'));
  directories.push(directory);
  const store = new DownloadStore(directory);
  const configuration: ServerConfig = {
    dataDirectory: directory,
    port: PORT,
    concurrency: 1,
    maximumFileBytes: SIZE,
    accessToken: 'test-secret-password-more-than-thirty-two-characters',
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
  const job: DownloadJob = {
    id: '299c97d0-07dc-45b7-8533-aa21083bd905',
    sourceType: SOURCE_TYPE.torrent,
    url: 'https://example.com/test.torrent',
    filename: 'Torrent',
    status: 'downloading',
    receivedBytes: 0,
    totalBytes: null,
    bytesPerSecond: 0,
    createdAt: '',
    finishedAt: null,
    errorMessage: null,
    torrentSelection: {
      files: [
        { index: 1, name: 'selected.bin', sizeBytes: SIZE },
        { index: 2, name: 'unused.bin', sizeBytes: SIZE },
      ],
      selected: [1],
    },
  };
  vi.mocked(downloadTorrent).mockImplementation(async (_job, root) => {
    await writeFile(path.join(root, 'selected.bin'), 'yes');
    await writeFile(path.join(root, 'unused.bin'), 'unselected piece overlap');
    await writeFile(path.join(root, 'metadata.torrent'), 'private metadata');
  });
  await transferExternal(job, store, new AbortController().signal, configuration, new TorrentRpc(directory));
  expect(job.files).toEqual([{ name: 'selected.bin', relativePath: 'selected.bin', sizeBytes: SIZE }]);
  expect(readFileSync(`${store.getFilePath(job.id)}.files/selected.bin`, 'utf8')).toBe('yes');
  expect(existsSync(`${store.getFilePath(job.id)}.files/unused.bin`)).toBe(false);
  expect(existsSync(`${store.getFilePath(job.id)}.files/metadata.torrent`)).toBe(false);
});
