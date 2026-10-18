import { setTimeout as delay } from 'node:timers/promises';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../shared/contracts.js';
import { POLICY_LIMIT } from '../../shared/policy.js';
import { LIMIT } from '../constants.js';
import { StorageHoldError } from '../policy/storage.js';

/** Optional controls keep the direct streaming boundary independently testable. */
export interface TransferOptions {
  bytesPerSecond?: number;
  reservedFreeBytes?: number;
  onCheckpoint?: () => void;
}

/**
 * Preserves private partial data for intentional suspension and temporary space pressure.
 * @param {DownloadJob} job - Current lifecycle state.
 * @param {unknown} [error] - Optional worker error.
 * @returns {boolean} Whether progress must survive worker cleanup.
 */
export function shouldRetainProgress(job: DownloadJob, error?: unknown): boolean {
  return (
    job.status === DOWNLOAD_STATUS.paused || job.status === DOWNLOAD_STATUS.queued || error instanceof StorageHoldError
  );
}

/**
 * Spaces direct writes to a bounded average rate and keeps cancellation responsive during long waits.
 * @param {number} receivedBytes - New bytes consumed by this worker invocation.
 * @param {number} startedAt - Worker start time in milliseconds.
 * @param {number} bytesPerSecond - Assigned byte budget, zero for unlimited.
 * @param {AbortSignal} signal - Pause, cancellation or shutdown.
 * @returns {Promise<void>} Rate budget becomes available.
 */
export async function waitForBandwidth(
  receivedBytes: number,
  startedAt: number,
  bytesPerSecond: number,
  signal: AbortSignal,
): Promise<void> {
  if (!bytesPerSecond) {
    return;
  }
  const deadline = startedAt + (receivedBytes / bytesPerSecond) * LIMIT.millisecondsPerSecond;
  while (Date.now() < deadline) {
    await delay(Math.min(deadline - Date.now(), POLICY_LIMIT.maximumThrottleSliceMilliseconds), undefined, { signal });
  }
}
