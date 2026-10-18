import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DownloadQueue } from '../server/downloads/queue';
import { validateHistory } from '../server/downloads/validateHistory';
import { TorrentRpc } from '../server/engines/torrent/rpc';
import { downloadTorrent } from '../server/engines/torrent/downloadTorrent';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { SOURCE_TYPE } from '../shared/sources';
import type { ServerConfig } from '../server/config';

const MAXIMUM_BYTES = 1_024;
const SERVICE_PORT = 8_080;
const directories: string[] = [];
/**
 * Builds an isolated torrent configuration without starting a peer network.
 * @returns {ServerConfig} Temporary station configuration.
 */
function createConfiguration(): ServerConfig {
  const directory = mkdtempSync(path.resolve('tests/.torrent-'));
  directories.push(directory);
  return {
    dataDirectory: directory,
    port: SERVICE_PORT,
    concurrency: 1,
    maximumFileBytes: MAXIMUM_BYTES,
    accessToken: 'a-test-password-that-is-not-a-real-secret',
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
}
/** Baseline metadata-only magnet request. */
const MAGNET_JOB: DownloadJob = {
  id: '299c97d0-07dc-45b7-8533-aa21083bd905',
  url: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
  filename: 'Magnet download',
  sourceType: SOURCE_TYPE.magnet,
  status: DOWNLOAD_STATUS.downloading,
  receivedBytes: 0,
  totalBytes: null,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: null,
  errorMessage: null,
};
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('torrent lifecycle', () => {
  it('persists uploaded metadata by generated ID and restores its history', () => {
    const configuration = createConfiguration();
    const queue = new DownloadQueue(configuration);
    queue.stop();
    const torrentBytes = Buffer.from('d4:infod4:name4:testee');
    const job = queue.addTorrent(torrentBytes.toString('base64'), '../example.torrent');
    expect(job.filename).toBe('example.torrent');
    expect(readFileSync(path.join(configuration.dataDirectory, 'torrents', `${job.id}.torrent`))).toEqual(torrentBytes);
    expect(validateHistory([job])[0]?.sourceType).toBe(SOURCE_TYPE.torrent);
    queue.cancel(job);
    queue.remove(job);
    expect(queue.store.jobs).toHaveLength(0);
  });
  it('rejects non-torrent uploads before creating a job', () => {
    const queue = new DownloadQueue(createConfiguration());
    queue.stop();
    expect(() => queue.addTorrent(Buffer.from('not metadata').toString('base64'), 'bad.torrent')).toThrow();
    expect(queue.store.jobs).toHaveLength(0);
  });
  it('follows magnet metadata to its content GID and releases every owned transfer', async () => {
    const configuration = createConfiguration();
    configuration.downloadBytesPerSecond = MAXIMUM_BYTES;
    configuration.uploadBytesPerSecond = MAXIMUM_BYTES;
    const engine = new TorrentRpc(configuration.dataDirectory);
    vi.spyOn(engine, 'start').mockResolvedValue();
    const call = vi
      .spyOn(engine, 'call')
      .mockResolvedValue('OK')
      .mockResolvedValueOnce('metadata-gid')
      .mockResolvedValueOnce({ gid: 'metadata-gid', status: 'complete', followedBy: ['content-gid'] })
      .mockResolvedValueOnce({
        gid: 'content-gid',
        status: 'complete',
        totalLength: '100',
        completedLength: '100',
        downloadSpeed: '0',
        connections: '2',
        bittorrent: { info: { name: 'Example release' } },
      });
    const job = { ...MAGNET_JOB };
    await downloadTorrent(job, '/data/example', new AbortController().signal, configuration, engine);
    expect(call).toHaveBeenCalledWith('tellStatus', ['content-gid', expect.any(Array)]);
    expect(call).toHaveBeenCalledWith('forceRemove', ['content-gid']);
    expect(call).toHaveBeenCalledWith('removeDownloadResult', ['metadata-gid']);
    expect(job.filename).toBe('Example release');
    const peerCount = 2;
    expect(job.peers).toBe(peerCount);
    const options = call.mock.calls[0]?.[1][1] as Record<string, string>;
    expect(options['max-download-limit']).toBe(String(MAXIMUM_BYTES));
    expect(options['max-upload-limit']).toBe(String(MAXIMUM_BYTES));
  });
  it('flushes torrent progress through pause before releasing an interrupted engine transfer', async () => {
    const configuration = createConfiguration();
    const engine = new TorrentRpc(configuration.dataDirectory);
    const controller = new AbortController();
    vi.spyOn(engine, 'start').mockResolvedValue();
    const call = vi
      .spyOn(engine, 'call')
      .mockResolvedValue('OK')
      .mockResolvedValueOnce('content-gid')
      .mockResolvedValueOnce({
        status: 'active',
        totalLength: '100',
        completedLength: '10',
        connections: '1',
        downloadSpeed: '1',
      });
    const worker = downloadTorrent({ ...MAGNET_JOB }, '/data/example', controller.signal, configuration, engine);
    setTimeout(() => controller.abort(new Error('Paused for test')), 0);
    await expect(worker).rejects.toMatchObject({ name: 'AbortError' });
    expect(call).toHaveBeenCalledWith('forcePause', ['content-gid']);
    expect(call).toHaveBeenCalledWith('forceRemove', ['content-gid']);
  });
  it('rejects oversized torrent contents and removes the active engine transfer', async () => {
    const configuration = createConfiguration();
    const engine = new TorrentRpc(configuration.dataDirectory);
    vi.spyOn(engine, 'start').mockResolvedValue();
    const call = vi
      .spyOn(engine, 'call')
      .mockResolvedValue('OK')
      .mockResolvedValueOnce('content-gid')
      .mockResolvedValueOnce({ status: 'active', totalLength: String(MAXIMUM_BYTES + 1), completedLength: '0' });
    await expect(
      downloadTorrent({ ...MAGNET_JOB }, '/data/example', new AbortController().signal, configuration, engine),
    ).rejects.toThrow('size limit');
    expect(call).toHaveBeenCalledWith('forceRemove', ['content-gid']);
  });
  it('retains a cleanup handle when the submission response is lost', async () => {
    const configuration = createConfiguration();
    const engine = new TorrentRpc(configuration.dataDirectory);
    vi.spyOn(engine, 'start').mockResolvedValue();
    const call = vi
      .spyOn(engine, 'call')
      .mockResolvedValue('OK')
      .mockRejectedValueOnce(new Error('RPC response timed out'));
    await expect(
      downloadTorrent({ ...MAGNET_JOB }, '/data/example', new AbortController().signal, configuration, engine),
    ).rejects.toThrow('timed out');
    const submittedParameters = call.mock.calls[0]?.[1];
    const options = submittedParameters?.[1] as { gid: string };
    expect(options.gid).toMatch(/^[a-f\d]{16}$/);
    expect(call).toHaveBeenCalledWith('forceRemove', [options.gid]);
  });
});
