import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { SOURCE_TYPE } from '../../../shared/sources.js';
import type { DownloadJob } from '../../../shared/contracts.js';
import type { ServerConfig } from '../../config.js';
import { ENGINE_LIMIT } from '../constants.js';
import { TorrentRpc, type TorrentStatus } from './rpc.js';
import { readTorrentMetadata } from './source.js';
import { ensureStorage } from '../../policy/storage.js';

/**
 * Transfers a torrent or magnet through the shared private engine, tracking magnet metadata handoff.
 * @param {DownloadJob} job - Live torrent job.
 * @param {string} outputDirectory - Isolated content directory.
 * @param {AbortSignal} signal - Owner cancellation.
 * @param {ServerConfig} configuration - Job quota and metadata location.
 * @param {TorrentRpc} engine - Process-owned RPC client.
 * @returns {Promise<void>} Verified complete torrent contents; post-completion seeding is disabled.
 */
export async function downloadTorrent(
  job: DownloadJob,
  outputDirectory: string,
  signal: AbortSignal,
  configuration: ServerConfig,
  engine: TorrentRpc,
): Promise<void> {
  await engine.start();
  signal.throwIfAborted();
  const requestedGid = randomBytes(ENGINE_LIMIT.gidBytes).toString('hex');
  const ownedGids = new Set([requestedGid]);
  const options = {
    gid: requestedGid,
    dir: outputDirectory,
    'file-allocation': 'none',
    'seed-time': '0',
    'allow-overwrite': 'false',
    'auto-file-renaming': 'false',
    'bt-save-metadata': 'false',
    'check-integrity': 'true',
    'max-download-limit': String(configuration.downloadBytesPerSecond ?? 0),
    'max-upload-limit': String(configuration.uploadBytesPerSecond ?? 0),
    'bt-stop-timeout': String(ENGINE_LIMIT.secondsWithoutPeers),
  };
  try {
    let currentGid =
      job.sourceType === SOURCE_TYPE.magnet
        ? await engine.call<string>('addUri', [[job.url], options])
        : await engine.call<string>('addTorrent', [
            await readTorrentMetadata(job, configuration.dataDirectory, signal),
            [],
            options,
          ]);
    ownedGids.add(currentGid);
    while (true) {
      signal.throwIfAborted();
      ensureStorage(configuration.dataDirectory, configuration.reservedFreeBytes ?? 0);
      const state = await engine.call<TorrentStatus>('tellStatus', [
        currentGid,
        ['gid', 'status', 'totalLength', 'completedLength', 'downloadSpeed', 'connections', 'followedBy', 'bittorrent'],
      ]);
      if (state.followedBy?.length) {
        for (const gid of state.followedBy) {
          ownedGids.add(gid);
        }
        const [contentGid] = state.followedBy;
        if (!contentGid) {
          throw new Error('Torrent metadata did not provide content.');
        }
        currentGid = contentGid;
        continue;
      }
      const totalBytes = Number(state.totalLength);
      const receivedBytes = Number(state.completedLength);
      if (totalBytes > configuration.maximumFileBytes || receivedBytes > configuration.maximumFileBytes) {
        throw new Error('Torrent contents exceed the configured per-download size limit.');
      }
      job.totalBytes = totalBytes || null;
      job.receivedBytes = receivedBytes;
      job.bytesPerSecond = Number(state.downloadSpeed);
      job.peers = Number(state.connections);
      job.stage = totalBytes ? 'Downloading from peers' : 'Finding peers · fetching metadata';
      const name = state.bittorrent?.info?.name;
      if (name) {
        job.filename = name;
      }
      if (state.status === 'complete') {
        return;
      }
      if (state.status === 'error' || state.status === 'removed') {
        throw new Error('Torrent transfer stopped. Check tracker availability, peers and free disk space.');
      }
      await delay(ENGINE_LIMIT.progressIntervalMilliseconds, undefined, { signal });
    }
  } finally {
    // A submission may succeed even if its RPC response is lost; the preassigned GID remains ours to clean.
    for (const gid of [...ownedGids]) {
      try {
        const state = await engine.call<TorrentStatus>('tellStatus', [gid, ['followedBy']]);
        for (const childGid of state.followedBy ?? []) {
          ownedGids.add(childGid);
        }
      } catch {
        /* Missing or stopped metadata has no discoverable child. */
      }
    }
    for (const gid of [...ownedGids].reverse()) {
      if (signal.aborted) {
        try {
          await engine.call('forcePause', [gid]);
        } catch {
          /* A complete or already stopped transfer has no active control file to flush. */
        }
      }
      try {
        await engine.call('forceRemove', [gid]);
      } catch {
        /* Completed or already removed GIDs need no removal. */
      }
      try {
        await engine.call('removeDownloadResult', [gid]);
      } catch {
        /* Active GIDs have no result yet. */
      }
    }
  }
}
