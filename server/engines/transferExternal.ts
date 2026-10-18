import { mkdir, rename, rm } from 'node:fs/promises';
import type { DownloadJob } from '../../shared/contracts.js';
import { SOURCE_TYPE, isAudioQuality } from '../../shared/sources.js';
import type { ServerConfig } from '../config.js';
import type { DownloadStore } from '../downloads/store.js';
import { OUTPUT } from './constants.js';
import { listArtifacts, resolveArtifactPath } from './artifacts.js';
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
    let artifacts = await listArtifacts(workingDirectory, '', !isTorrent);
    if (isTorrent && job.torrentSelection?.selected && job.torrentSelection.files) {
      const selected = job.torrentSelection.files.filter((file) =>
        job.torrentSelection?.selected?.includes(file.index),
      );
      const allowed = new Map(selected.map((file) => [file.name, file.sizeBytes]));
      for (const artifact of artifacts) {
        if (!allowed.has(artifact.relativePath)) {
          await rm(await resolveArtifactPath(workingDirectory, artifact.relativePath), { force: true });
        }
      }
      artifacts = artifacts.filter((artifact) => allowed.has(artifact.relativePath));
      if (
        artifacts.length !== selected.length ||
        artifacts.some((file) => allowed.get(file.relativePath) !== file.sizeBytes)
      ) {
        throw new Error('Selected torrent output is incomplete or has changed.');
      }
    }
    if (!isTorrent && isAudioQuality(job.quality)) {
      for (const artifact of artifacts) {
        if (!artifact.relativePath.toLowerCase().endsWith('.mp3')) {
          await rm(await resolveArtifactPath(workingDirectory, artifact.relativePath), { force: true });
        }
      }
      artifacts = artifacts.filter((artifact) => artifact.relativePath.toLowerCase().endsWith('.mp3'));
    }
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
