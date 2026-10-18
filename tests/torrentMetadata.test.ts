import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { expect, it, vi } from 'vitest';
import { readTorrentMetadata } from '../server/engines/torrent/source';
import { openSource } from '../server/downloads/openSource';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { SOURCE_TYPE } from '../shared/sources';

vi.mock('../server/downloads/openSource', () => ({ openSource: vi.fn() }));

/**
 * Pins remote metadata so an edited torrent URL cannot mix another torrent into resumed staging.
 * @returns {Promise<void>} Resumed reads use the atomically persisted original metadata.
 */
it('pins remote torrent metadata once for subsequent resume attempts', async () => {
  const directory = mkdtempSync(path.resolve('tests/.metadata-'));
  const job: DownloadJob = {
    id: '2973533c-346f-49cf-9c9e-378378d820f8',
    url: 'https://example.com/file.torrent',
    filename: 'file.torrent',
    sourceType: SOURCE_TYPE.torrent,
    status: DOWNLOAD_STATUS.downloading,
    receivedBytes: 0,
    totalBytes: null,
    bytesPerSecond: 0,
    createdAt: '',
    finishedAt: null,
    errorMessage: null,
  };
  const metadata = Buffer.from('d4:infod4:name4:testee');
  vi.mocked(openSource).mockResolvedValue(Object.assign(Readable.from([metadata]), { headers: {} }) as IncomingMessage);
  try {
    const first = await readTorrentMetadata(job, directory, new AbortController().signal);
    const resumed = await readTorrentMetadata(job, directory, new AbortController().signal);
    expect(first).toBe(metadata.toString('base64'));
    expect(resumed).toBe(first);
    expect(openSource).toHaveBeenCalledTimes(1);
    expect(readFileSync(path.join(directory, 'torrents', `${job.id}.torrent`))).toEqual(metadata);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
