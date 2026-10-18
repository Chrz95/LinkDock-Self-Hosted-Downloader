import { mkdir, rename, rm } from 'node:fs/promises';
import type { DownloadJob } from '../../shared/contracts.js';
import { SOURCE_TYPE } from '../../shared/sources.js';
import type { ServerConfig } from '../config.js';
import type { DownloadStore } from '../downloads/store.js';
import { OUTPUT } from './constants.js';
import { listArtifacts } from './artifacts.js';
import { downloadMedia } from './media.js';
import { downloadTorrent } from './torrent/downloadTorrent.js';
import type { TorrentRpc } from './torrent/rpc.js';
import { shouldRetainProgress } from '../downloads/transferPolicy.js';

/**
 * Publishes external-engine output only after success, manifest validation and total-size verification.
 * @param {DownloadJob} job - Site or peer-to-peer job.
 * @param {DownloadStore} store - Station storage.
 * @param {AbortSignal} signal - Queue cancellation.
 * @param {ServerConfig} configuration - Limits and credentials.
 * @param {TorrentRpc} torrentEngine - Process-owned torrent service.
 * @returns {Promise<void>} Atomically published file set.
 */
export async function transferExternal(
  job: DownloadJob,
  store: DownloadStore,
  signal: AbortSignal,
  configuration: ServerConfig,
  torrentEngine: TorrentRpc,
): Promise<void> {
  const workingDirectory = `${store.getFilePath(job.id)}${OUTPUT.workingSuffix}`;
  const publishedDirectory = `${store.getFilePath(job.id)}${OUTPUT.outputSuffix}`;
  await mkdir(workingDirectory, { recursive: true, mode: 0o700 });
  let failure: unknown;
  try {
    const isTorrent = job.sourceType === SOURCE_TYPE.torrent || job.sourceType === SOURCE_TYPE.magnet;
    if (isTorrent) {
      await downloadTorrent(job, workingDirectory, signal, configuration, torrentEngine);
    } else {
      await downloadMedia(job, workingDirectory, signal, configuration);
    }
    signal.throwIfAborted();
    const artifacts = await listArtifacts(workingDirectory, '', !isTorrent);
    const totalBytes = artifacts.reduce((total, file) => total + file.sizeBytes, 0);
    if (!artifacts.length) {
      throw new Error('The source produced no downloadable files.');
    }
    if (totalBytes > configuration.maximumFileBytes) {
      throw new Error('The download exceeds its total size limit.');
    }
    await rm(publishedDirectory, { recursive: true, force: true });
    await rename(workingDirectory, publishedDirectory);
    job.files = artifacts;
    if (artifacts.length === 1 && artifacts[0]) {
      job.filename = artifacts[0].name;
    }
    job.receivedBytes = totalBytes;
    job.totalBytes = totalBytes;
    job.stage = `${artifacts.length} ${artifacts.length === 1 ? 'file' : 'files'} saved`;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (!shouldRetainProgress(job, failure)) {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  }
}
