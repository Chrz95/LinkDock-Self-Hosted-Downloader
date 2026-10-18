import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDeliveryFixture, cleanupDeliveryFixtures } from './helpers/deliveryFixture';
import { TorrentRpc } from '../server/engines/torrent/rpc';
import { downloadTorrent } from '../server/engines/torrent/downloadTorrent';
import { parseEngineFiles, prepareTorrentSelection, pinMagnetMetadata } from '../server/engines/torrent/selection';
import { validateTorrentSelection } from '../shared/jobOptions';
import { validateHistory } from '../server/downloads/validateHistory';
import { DOWNLOAD_STATUS } from '../shared/contracts';
import { SOURCE_TYPE } from '../shared/sources';

const META = 'd4:infod4:name4:testee';
const HASH = '0123456789abcdef0123456789abcdef01234567';
const FILE_BYTES = 3;
const SECOND_INDEX = 2;
const TOO_LARGE = 9_999;
const directories: string[] = [];
afterEach(async () => {
  await cleanupDeliveryFixtures();
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  vi.restoreAllMocks();
});
/** Creates private output space. @returns {string} Isolated engine directory. */
function createOutput(): string {
  const directory = mkdtempSync(path.resolve('tests/.selection-'));
  directories.push(directory);
  return directory;
}

it('pauses magnet content before payload, pins its metadata and retains a selectable history manifest', async () => {
  const { queue, configuration } = await createDeliveryFixture();
  const job = queue.add(`magnet:?xt=urn:btih:${HASH}`);
  job.status = DOWNLOAD_STATUS.downloading;
  configuration.maximumFileBytes = FILE_BYTES;
  const directory = createOutput();
  writeFileSync(path.join(directory, `${HASH}.torrent`), META);
  const engine = new TorrentRpc(configuration.dataDirectory);
  vi.spyOn(engine, 'start').mockResolvedValue();
  const call = vi
    .spyOn(engine, 'call')
    .mockResolvedValue('OK')
    .mockResolvedValueOnce('metadata-gid')
    .mockResolvedValueOnce({
      status: 'active',
      totalLength: '100',
      completedLength: '10',
      downloadSpeed: '1',
      connections: '1',
    })
    .mockResolvedValueOnce({ status: 'complete', followedBy: ['payload-gid'] })
    .mockResolvedValueOnce({ status: 'paused', bittorrent: { info: { name: 'Example collection' } } })
    .mockResolvedValueOnce([{ index: '1', path: path.join(directory, 'movie.mp4'), length: String(FILE_BYTES) }]);
  await expect(downloadTorrent(job, directory, new AbortController().signal, configuration, engine)).rejects.toThrow(
    'selection required',
  );
  expect(job.status).toBe(DOWNLOAD_STATUS.paused);
  expect(job.torrentSelection?.files?.[0]?.name).toBe('movie.mp4');
  expect(call).not.toHaveBeenCalledWith('unpause', expect.anything());
  expect(call.mock.calls[0]?.[1][1]).toMatchObject({ 'pause-metadata': 'true', 'bt-save-metadata': 'true' });
  expect(readFileSync(path.join(configuration.dataDirectory, 'torrents', `${job.id}.torrent`), 'utf8')).toBe(META);
  expect(validateHistory([job])[0]?.torrentSelection).toEqual(job.torrentSelection);
});

it(
  'starts uploaded content paused and applies approved indexes before ' + 'unpausing, with selected-size quota',
  async () => {
    const { queue, configuration } = await createDeliveryFixture();
    configuration.maximumFileBytes = FILE_BYTES;
    const job = queue.addTorrent(Buffer.from(META).toString('base64'), 'example.torrent');
    const directory = createOutput();
    job.torrentSelection = {
      files: [
        { index: 1, name: 'unused.bin', sizeBytes: TOO_LARGE },
        { index: SECOND_INDEX, name: 'selected.bin', sizeBytes: FILE_BYTES },
      ],
      selected: [SECOND_INDEX],
    };
    const engine = new TorrentRpc(configuration.dataDirectory);
    vi.spyOn(engine, 'start').mockResolvedValue();
    const call = vi
      .spyOn(engine, 'call')
      .mockResolvedValue('OK')
      .mockResolvedValueOnce('payload-gid')
      .mockResolvedValueOnce({ status: 'paused' })
      .mockResolvedValueOnce(
        job.torrentSelection.files?.map((file) => ({
          index: String(file.index),
          path: path.join(directory, file.name),
          length: String(file.sizeBytes),
        })),
      )
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce({
        status: 'complete',
        totalLength: String(FILE_BYTES),
        completedLength: String(FILE_BYTES),
        downloadSpeed: '0',
        connections: '0',
      });
    await downloadTorrent(job, directory, new AbortController().signal, configuration, engine);
    const indexes = { 'select-file': '2', 'bt-remove-unselected-file': 'true' };
    expect(call.mock.calls[0]?.[1][2]).toMatchObject({ pause: 'true' });
    expect(call).toHaveBeenCalledWith('changeOption', ['payload-gid', indexes]);
    expect(call.mock.calls.findIndex(([method]) => method === 'changeOption')).toBeLessThan(
      call.mock.calls.findIndex(([method]) => method === 'unpause'),
    );
    expect(job.receivedBytes).toBe(FILE_BYTES);
  },
);

it('rejects traversal, duplicate/empty indexes and changed pinned metadata without starting content', async () => {
  const { queue, configuration } = await createDeliveryFixture();
  const job = queue.addTorrent(Buffer.from(META).toString('base64'), 'test.torrent');
  job.status = DOWNLOAD_STATUS.paused;
  job.torrentSelection = { files: [{ index: 1, name: 'safe', sizeBytes: FILE_BYTES }] };
  expect(() => parseEngineFiles([{ index: '1', path: '/outside/escape', length: '0' }], '/owned')).toThrow();
  expect(() => validateTorrentSelection([], job.torrentSelection!.files!)).toThrow();
  expect(() => validateTorrentSelection([1, 1], job.torrentSelection!.files!)).toThrow();
  expect(() => queue.resume(job)).toThrow('Choose torrent files');
  const engine = new TorrentRpc(configuration.dataDirectory);
  const call = vi.spyOn(engine, 'call').mockResolvedValue([{ index: '1', path: '/owned/changed', length: '3' }]);
  await expect(prepareTorrentSelection(job, 'gid', '/owned', engine, FILE_BYTES)).rejects.toThrow('metadata changed');
  expect(call).not.toHaveBeenCalledWith('unpause', expect.anything());
});

it('rolls back a rejected selection write and persists only valid explicit indexes', async () => {
  const { queue } = await createDeliveryFixture();
  const job = queue.addTorrent(Buffer.from(META).toString('base64'), 'test.torrent');
  job.status = DOWNLOAD_STATUS.paused;
  job.torrentSelection = { files: [{ index: 1, name: 'safe', sizeBytes: FILE_BYTES }] };
  vi.spyOn(queue.store, 'save').mockImplementationOnce(() => {
    throw new Error('Disk full');
  });
  expect(() => queue.selectTorrentFiles(job, [1])).toThrow('Disk full');
  expect(job.torrentSelection.selected).toBeUndefined();
  expect(job.status).toBe(DOWNLOAD_STATUS.paused);
  queue.selectTorrentFiles(job, [1]);
  expect(
    validateHistory(JSON.parse(readFileSync(path.join(queue.store.filesDirectory, '..', 'history.json'), 'utf8')))[0]
      ?.torrentSelection?.selected,
  ).toEqual([1]);
  expect(() => queue.selectTorrentFiles(job, [1])).toThrow('restart');
});

it('rejects ambiguous magnet metadata rather than pinning an arbitrary file', async () => {
  const { queue, configuration } = await createDeliveryFixture();
  const job = queue.add(`magnet:?xt=urn:btih:${HASH}`);
  expect(job.sourceType).toBe(SOURCE_TYPE.magnet);
  const directory = createOutput();
  mkdirSync(path.join(directory, 'nested'));
  await expect(pinMagnetMetadata(job, directory, configuration.dataDirectory)).rejects.toThrow('pinned safely');
});

it('allows resuming metadata retrieval before the torrent file list is available', async () => {
  const { queue } = await createDeliveryFixture();
  const job = queue.add(`magnet:?xt=urn:btih:${HASH}`);
  job.status = DOWNLOAD_STATUS.paused;
  queue.resume(job);
  expect(job.status).toBe(DOWNLOAD_STATUS.queued);
  expect(job.torrentSelection).toEqual({});
});
