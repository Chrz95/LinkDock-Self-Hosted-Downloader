import { statfsSync } from 'node:fs';

/** Distinguishes a temporary storage hold from a failed source or corrupted output. */
export class StorageHoldError extends Error {
  /**
   * Records the free-space threshold needed to avoid retrying the same unwritable chunk in a tight loop.
   * @param {string} message - Visible hold explanation.
   * @param {number} requiredFreeBytes - Buffer plus the pending write size.
   */
  constructor(
    message: string,
    readonly requiredFreeBytes: number,
  ) {
    super(message);
  }
}

/**
 * Keeps a free-space buffer before writes; external engines also receive periodic checks.
 * @param {string} directory - Filesystem containing the station data.
 * @param {number} reserveBytes - Minimum free bytes requested by the owner.
 * @param {number} [incomingBytes] - Bytes about to be written by the direct stream.
 */
export function ensureStorage(directory: string, reserveBytes: number, incomingBytes = 0): void {
  const storage = statfsSync(directory);
  if (storage.bavail * storage.bsize - incomingBytes < reserveBytes) {
    throw new StorageHoldError(
      'Waiting for free disk space. Free space or lower the reserved buffer.',
      reserveBytes + incomingBytes,
    );
  }
}
