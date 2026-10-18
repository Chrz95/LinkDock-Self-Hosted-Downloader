import path from 'node:path';
import { readdir, open, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../../shared/contracts.js';
import { validateTorrentFiles, validateTorrentSelection, type TorrentFile } from '../../../shared/jobOptions.js';
import type { TorrentRpc } from './rpc.js';
import { saveUploadedTorrent } from '../../downloads/uploadTorrent.js';
import { ENGINE_LIMIT } from '../constants.js';

/**
 * Pins a magnet's locally retrieved metadata before releasing its paused content GID.
 * @param {DownloadJob} job - Metadata-backed magnet job.
 * @param {string} directory - Private working directory.
 * @param {string} dataDirectory - Persistent station root.
 * @returns {Promise<void>} Metadata saved under the job UUID.
 */
export async function pinMagnetMetadata(job: DownloadJob, directory: string, dataDirectory: string): Promise<void> {
  const candidates = (await readdir(directory)).filter((name) => /^[a-f\d]{40}\.torrent$/iu.test(name));
  if (candidates.length !== 1 || !candidates[0]) {
    throw new Error('Magnet metadata could not be pinned safely.');
  }
  const filename = path.join(directory, candidates[0]);
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await file.stat()).isFile()) {
      throw new Error('Invalid magnet metadata.');
    }
    const bytes = Buffer.alloc(ENGINE_LIMIT.maximumTorrentBytes + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, null);
      if (!result.bytesRead) {
        break;
      }
      offset += result.bytesRead;
    }
    if (offset > ENGINE_LIMIT.maximumTorrentBytes) {
      throw new Error('Torrent metadata exceeds 2 MiB.');
    }
    saveUploadedTorrent(bytes.subarray(0, offset).toString('base64'), job.filename, job.id, dataDirectory);
  } finally {
    await file.close();
  }
  await unlink(filename);
}

/**
 * Normalizes getFiles output only beneath this job's engine directory.
 * @param {unknown} input - Untrusted local RPC result.
 * @param {string} directory - Configured private output root.
 * @returns {TorrentFile[]} Canonical relative file names and one-based indexes.
 */
export function parseEngineFiles(input: unknown, directory: string): TorrentFile[] {
  if (!Array.isArray(input)) {
    throw new Error('Torrent file metadata is unavailable.');
  }
  return validateTorrentFiles(
    input.map((item: unknown) => {
      if (!item || typeof item !== 'object') {
        throw new Error('Invalid torrent file.');
      }
      const value = item as Record<string, unknown>;
      if (
        typeof value.path !== 'string' ||
        !path.isAbsolute(value.path) ||
        typeof value.index !== 'string' ||
        !/^[1-9]\d*$/u.test(value.index) ||
        typeof value.length !== 'string' ||
        !/^\d+$/u.test(value.length)
      ) {
        throw new Error('Invalid torrent file metadata.');
      }
      return {
        index: Number(value.index),
        name: path.relative(directory, value.path),
        sizeBytes: Number(value.length),
      };
    }),
  );
}

/**
 * Pauses new jobs for review or reapplies a previously approved selection before any payload transfer.
 * @param {DownloadJob} job - Live transfer with selection requirements.
 * @param {string} gid - Paused content transfer.
 * @param {string} directory - Private engine output root.
 * @param {TorrentRpc} engine - Owned local engine.
 * @param {number} maximumBytes - Selected logical payload ceiling.
 * @returns {Promise<void>} Approved selection applied and transfer unpaused.
 */
export async function prepareTorrentSelection(
  job: DownloadJob,
  gid: string,
  directory: string,
  engine: TorrentRpc,
  maximumBytes: number,
): Promise<void> {
  const files = parseEngineFiles(await engine.call('getFiles', [gid]), directory);
  if (job.torrentSelection?.files && JSON.stringify(job.torrentSelection.files) !== JSON.stringify(files)) {
    throw new Error('Torrent metadata changed. Restart and review the files again.');
  }
  const selected = job.torrentSelection?.selected;
  job.torrentSelection = { files, ...(selected ? { selected } : {}) };
  if (!selected) {
    job.status = DOWNLOAD_STATUS.paused;
    job.stage = 'Choose torrent files to continue';
    job.totalBytes = null;
    throw new Error('Torrent file selection required.');
  }
  validateTorrentSelection(selected, files);
  const total = files.filter((file) => selected.includes(file.index)).reduce((sum, file) => sum + file.sizeBytes, 0);
  if (!Number.isSafeInteger(total) || total > maximumBytes) {
    throw new Error('Selected files exceed the size limit.');
  }
  await engine.call('changeOption', [gid, { 'select-file': selected.join(','), 'bt-remove-unselected-file': 'true' }]);
  await engine.call('unpause', [gid]);
}
