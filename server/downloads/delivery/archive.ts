import yazl from 'yazl';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { ReadStream, Stats } from 'node:fs';
import type { DownloadJob } from '../../../shared/contracts.js';
import { HTTP_STATUS } from '../../../shared/contracts.js';
import { DELIVERY_LIMIT } from '../../../shared/media.js';
import { ENGINE_LIMIT } from '../../engines/constants.js';
import type { DownloadQueue } from '../queue.js';
import { openPublishedFile, FileDeliveryError } from './publishedFile.js';
import { ArchiveNames } from './archiveNames.js';

/** A preflighted file identity, not an open file descriptor or an arbitrary filesystem path. */
export interface ArchiveEntry {
  index: number;
  name: string;
  information: Stats;
}
/** Output cleanup includes lazy opens that can finish after the browser has disconnected. */
export interface ArchiveOutput {
  stream: Readable;
  waitForFiles: () => Promise<void>;
}
/** Ordinary regular-file permissions: ZIP extraction never creates executable files or symlinks. */
const ARCHIVE_MODE = 0o100600;

/**
 * Checks every manifest file before response bytes start, opening only one descriptor at a time.
 * @param {DownloadQueue} queue - Owner queue.
 * @param {DownloadJob} job - Completed multi-file job held by an export lease.
 * @param {AbortSignal} signal - Browser response lifecycle.
 * @returns {Promise<ArchiveEntry[]>} Bounded portable names and immutable size/identity snapshots.
 */
export async function prepareArchive(
  queue: DownloadQueue,
  job: DownloadJob,
  signal: AbortSignal,
): Promise<ArchiveEntry[]> {
  if (!job.files || job.files.length <= 1 || job.files.length > ENGINE_LIMIT.maximumFiles) {
    throw new FileDeliveryError(HTTP_STATUS.badRequest, 'Use the individual save button for a single-file download.');
  }
  const names = new ArchiveNames();
  const entries: ArchiveEntry[] = [];
  for (const [index, artifact] of job.files.entries()) {
    signal.throwIfAborted();
    const name = names.add(artifact.relativePath);
    const file = await openPublishedFile(queue, job, String(index));
    try {
      entries.push({ index, name, information: file.information });
    } finally {
      await file.handle.close();
    }
  }
  return entries;
}

/**
 * Streams uncompressed ZIP/ZIP64 with bounded buffers and lazy file opens, stopping promptly on cancellation.
 * @param {DownloadQueue} queue - Held job storage.
 * @param {DownloadJob} job - Completed immutable file collection.
 * @param {ArchiveEntry[]} entries - Preflighted portable manifest.
 * @param {AbortSignal} signal - Response close or idle cancellation.
 * @returns {ArchiveOutput} ZIP stream plus descriptor cleanup awaited before releasing the export slot.
 */
export function createArchiveStream(
  queue: DownloadQueue,
  job: DownloadJob,
  entries: ArchiveEntry[],
  signal: AbortSignal,
): ArchiveOutput {
  const zip = new yazl.ZipFile();
  const output = zip.outputStream as Readable;
  let active: ReadStream | undefined;
  let isFailed = false;
  const pendingFiles = new Set<Promise<void>>();
  /**
   * Stops the library pump as well as the active descriptor and output buffer.
   * @param {Error} error - Safe cancellation or file-identity failure.
   */
  function fail(error: Error): void {
    if (isFailed) {
      return;
    }
    isFailed = true;
    active?.destroy(error);
    output.destroy(error);
  }
  zip.on('error', fail);
  /** Cancels pending lazy opens and marks yazl errored so no following entry starts. */
  function cancel(): void {
    zip.emit('error', new Error('The ZIP download was interrupted.'));
  }
  signal.addEventListener('abort', cancel, { once: true });
  output.once('close', () => {
    signal.removeEventListener('abort', cancel);
    if (!output.readableEnded) {
      cancel();
    }
  });
  for (const entry of entries) {
    zip.addReadStreamLazy(
      entry.name,
      {
        size: entry.information.size,
        compress: false,
        mode: ARCHIVE_MODE,
        mtime: entry.information.mtime,
      },
      (callback) => {
        const pending = openPublishedFile(queue, job, String(entry.index))
          .then(async (file) => {
            try {
              const current = file.information;
              if (
                signal.aborted ||
                isFailed ||
                current.dev !== entry.information.dev ||
                current.ino !== entry.information.ino ||
                current.size !== entry.information.size ||
                current.mtimeMs !== entry.information.mtimeMs
              ) {
                throw new Error('The saved file changed or the export was cancelled.');
              }
              if (!current.size) {
                await file.handle.close();
                callback(null, Readable.from([]));
                return;
              }
              active = file.handle.createReadStream({
                autoClose: true,
                end: current.size - 1,
                highWaterMark: DELIVERY_LIMIT.streamBufferBytes,
              });
              const consumed = finished(active, { cleanup: true }).catch(() => undefined);
              active.on('error', (error) => zip.emit('error', error));
              callback(null, active);
              await consumed;
            } catch (error) {
              await file.handle.close();
              throw error;
            }
          })
          .catch((error: unknown) =>
            callback(error instanceof Error ? error : new Error('The ZIP source failed.'), Readable.from([])),
          );
        pendingFiles.add(pending);
        void pending.finally(() => pendingFiles.delete(pending));
      },
    );
  }
  zip.end();
  if (signal.aborted) {
    queueMicrotask(cancel);
  }
  /** Waits for active reads and pending lazy opens to close. @returns {Promise<void>} All descriptors released. */
  async function waitForFiles(): Promise<void> {
    await Promise.allSettled(pendingFiles);
  }
  return { stream: output, waitForFiles };
}
