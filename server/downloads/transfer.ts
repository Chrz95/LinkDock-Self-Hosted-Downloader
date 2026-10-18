import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { DownloadJob } from '../../shared/contracts.js';
import { LIMIT } from '../constants.js';
import { openResumableSource } from './resume.js';
import type { DownloadStore } from './store.js';
import { ensureStorage } from '../policy/storage.js';
import { shouldRetainProgress, waitForBandwidth, type TransferOptions } from './transferPolicy.js';

/**
 * Streams to disk with backpressure, a size ceiling and end-to-end cancellation.
 * @param {DownloadJob} job - Mutable live progress record.
 * @param {DownloadStore} store - UUID-addressed file storage.
 * @param {AbortSignal} signal - Cancellation source.
 * @param {number} maximumFileBytes - Per-file quota including unknown-length responses.
 * @param {TransferOptions} [options] - Assigned rate, space buffer and durable header checkpoint.
 * @returns {Promise<void>} Resolves after the complete file is atomically published.
 */
export async function transferToDisk(
  job: DownloadJob,
  store: DownloadStore,
  signal: AbortSignal,
  maximumFileBytes: number,
  options: TransferOptions = {},
): Promise<void> {
  const partialPath = store.getFilePath(job.id, true);
  const { response, offset, totalBytes } = await openResumableSource(job, partialPath, signal);
  job.totalBytes = totalBytes;
  job.receivedBytes = offset;
  options.onCheckpoint?.();
  if (job.totalBytes !== null && job.totalBytes > maximumFileBytes) {
    response.destroy();
    throw new Error('The source file exceeds the configured file-size limit.');
  }
  const startedAt = Date.now();
  const progressStream = new Transform({
    /**
     * Counts actual received bytes before allowing the next chunk onto disk.
     * @param {Buffer} chunk - Incoming bytes.
     * @param {BufferEncoding} _encoding - Unused binary encoding.
     * @param {TransformCallback} callback - Backpressure continuation or quota error.
     */
    transform(chunk: Buffer, _encoding, callback) {
      const nextBytes = job.receivedBytes + chunk.length;
      if (nextBytes > maximumFileBytes) {
        callback(new Error('The file-size limit was reached.'));
        return;
      }
      if (options.bytesPerSecond) {
        response.setTimeout?.(0);
      }
      void waitForBandwidth(nextBytes - offset, startedAt, options.bytesPerSecond ?? 0, signal)
        .then(() => {
          if (options.bytesPerSecond) {
            response.setTimeout?.(LIMIT.idleTimeoutMilliseconds);
          }
          ensureStorage(store.filesDirectory, options.reservedFreeBytes ?? 0, chunk.length);
          job.receivedBytes = nextBytes;
          const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / LIMIT.millisecondsPerSecond);
          job.bytesPerSecond = (job.receivedBytes - offset) / elapsedSeconds;
          callback(null, chunk);
        })
        .catch((error: unknown) => callback(error instanceof Error ? error : new Error('Transfer interrupted.')));
    },
  });
  let failure: unknown;
  try {
    await pipeline(
      response,
      progressStream,
      createWriteStream(partialPath, { mode: 0o600, flags: offset ? 'a' : 'w' }),
      {
        signal,
      },
    );
    signal.throwIfAborted();
    if (job.totalBytes !== null && job.receivedBytes !== job.totalBytes) {
      throw new Error('The source ended before its declared file length was received.');
    }
    await rename(partialPath, store.getFilePath(job.id));
    job.resumeValidator = undefined;
    job.resumeSourceUrl = undefined;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (!shouldRetainProgress(job, failure)) {
      await rm(partialPath, { force: true });
    }
  }
}
