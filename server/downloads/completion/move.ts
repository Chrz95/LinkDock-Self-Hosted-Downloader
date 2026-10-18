import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { DownloadJob } from '../../../shared/contracts.js';
import type { DownloadArtifact } from '../../../shared/sources.js';
import { OUTPUT } from '../../engines/constants.js';
import { resolveArtifactPath } from '../../engines/artifacts.js';
import type { DownloadStore } from '../store.js';
import { copyOrHash } from './copy.js';
import { MOVE, readJournal, writeJournal, type MoveJournal } from './journal.js';
import { destinationDirectory, safeDirectory } from './paths.js';

const MAXIMUM_LEAF_BYTES = 180;

/**
 * Creates a safe leaf for a direct download whose display name was never a disk pathname.
 * @param {string} input - Display filename.
 * @returns {string} Safe destination filename.
 */
function directLeaf(input: string): string {
  return input &&
    Buffer.byteLength(input) <= MAXIMUM_LEAF_BYTES &&
    !/[\p{Cc}\\/:]/u.test(input) &&
    !input.startsWith('.')
    ? input
    : 'download';
}
/**
 * Copies across filesystems, recovers a prepared publish, and commits routing before deleting the internal source.
 * @param {DownloadJob} job - Payload-ready job with an unmoved destination.
 * @param {DownloadStore} store - Durable job history and configured completion root.
 * @param {AbortSignal} signal - Pause/shutdown signal.
 * @returns {Promise<void>} Move persisted; on failure the original source remains available.
 */
export async function moveCompleted(job: DownloadJob, store: DownloadStore, signal: AbortSignal): Promise<void> {
  const { destination } = job;
  if (!destination || destination.moved) {
    return;
  }
  signal.throwIfAborted();
  const direct = !job.files?.length;
  const leaf = directLeaf(job.filename);
  const files: DownloadArtifact[] = job.files?.length
    ? job.files
    : [{ name: leaf, relativePath: leaf, sizeBytes: job.receivedBytes }];
  const directory = destinationDirectory(store.completedDirectory, job, true);
  let journal: MoveJournal;
  let created = false;
  try {
    mkdirSync(directory, { mode: MOVE.directoryMode });
    created = true;
    journal = { jobId: job.id, phase: 'copying', files };
    writeJournal(directory, journal);
  } catch (error) {
    if (created) {
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
    safeDirectory(directory);
    journal = readJournal(directory, job.id, files);
  }
  const incoming = path.join(directory, MOVE.incoming);
  const output = path.join(directory, MOVE.files);
  if (!existsSync(output)) {
    rmSync(incoming, { recursive: true, force: true });
    mkdirSync(incoming, { mode: MOVE.directoryMode });
    const hashes: string[] = [];
    for (const file of files) {
      signal.throwIfAborted();
      const source = direct
        ? store.getFilePath(job.id)
        : await resolveArtifactPath(`${store.getFilePath(job.id)}${OUTPUT.outputSuffix}`, file.relativePath);
      const target = path.join(incoming, file.relativePath);
      if (path.relative(incoming, target).startsWith('..') || path.isAbsolute(file.relativePath)) {
        throw new Error('Unsafe completion manifest.');
      }
      safeDirectory(path.dirname(target), true);
      hashes.push(await copyOrHash(source, file.sizeBytes, signal, target));
    }
    journal = { jobId: job.id, phase: 'prepared', files, hashes };
    writeJournal(directory, journal);
    signal.throwIfAborted();
    renameSync(incoming, output);
  } else {
    if (journal.phase !== 'prepared') {
      throw new Error('Unowned destination output exists.');
    }
    safeDirectory(output);
    for (const [index, file] of files.entries()) {
      const candidate = await resolveArtifactPath(output, file.relativePath);
      if ((await copyOrHash(candidate, file.sizeBytes, signal)) !== journal.hashes?.[index]) {
        throw new Error('Destination changed after an interrupted move.');
      }
    }
  }
  signal.throwIfAborted();
  const previousFiles = job.files;
  const previousDestination = job.destination;
  job.files = files;
  job.destination = { ...destination, moved: true, error: null };
  try {
    store.save();
  } catch (error) {
    job.files = previousFiles;
    job.destination = previousDestination;
    throw error;
  }
  // The destination is durable and is now the only published location; old copies are private cleanup.
  try {
    rmSync(store.getFilePath(job.id), { force: true });
    rmSync(`${store.getFilePath(job.id)}${OUTPUT.outputSuffix}`, { recursive: true, force: true });
  } catch {
    /* A leftover internal copy must never invalidate the committed destination. */
  }
}
