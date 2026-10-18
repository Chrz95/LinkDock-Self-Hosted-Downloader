import { DELIVERY_LIMIT } from '../../../shared/media.js';

/** Concurrent exports retain published job files until the response finishes or disconnects. */
export class ArchiveAccess {
  private readonly readers = new Map<string, number>();
  private count = 0;

  /**
   * Reserves one bounded export slot and returns an idempotent release callback.
   * @param {string} jobId - Existing completed job.
   * @returns {(() => void) | null} Lease release, or null while the station is busy.
   */
  acquire(jobId: string): (() => void) | null {
    if (this.count >= DELIVERY_LIMIT.maximumArchives) {
      return null;
    }
    this.count += 1;
    this.readers.set(jobId, (this.readers.get(jobId) ?? 0) + 1);
    let isReleased = false;
    return () => {
      if (isReleased) {
        return;
      }
      isReleased = true;
      this.count -= 1;
      const remaining = (this.readers.get(jobId) ?? 1) - 1;
      if (remaining) {
        this.readers.set(jobId, remaining);
      } else {
        this.readers.delete(jobId);
      }
    };
  }

  /**
   * Reports whether deleting a published job would interrupt its archive export.
   * @param {string} jobId - Candidate deletion.
   * @returns {boolean} Active export still holds this job.
   */
  has(jobId: string): boolean {
    return this.readers.has(jobId);
  }
}
