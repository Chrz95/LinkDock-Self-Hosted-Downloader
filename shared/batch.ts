import { DOWNLOAD_STATUS, type DownloadJob } from './contracts.js';
import type { SourceType, VideoQuality } from './sources.js';

/** Bounded batch size shared by review controls and server validation. */
export const MAXIMUM_BATCH_LINKS = 50;
/** Explicit scheduling levels; legacy jobs retain normal priority. */
export const JOB_PRIORITY = { low: 0, normal: 1, high: 2 } as const;
/** Whitelisted queue priority. */
export type JobPriority = (typeof JOB_PRIORITY)[keyof typeof JOB_PRIORITY];
/** Source choices applied consistently to one batch. */
export interface BatchOptions {
  sourceType?: SourceType;
  quality?: VideoQuality;
}
/** Owner-visible review; this never changes queue state. */
export interface BatchPreview {
  newCount: number;
  duplicates: string[];
}
/** Atomic acceptance result; duplicates are reported rather than started twice. */
export interface BatchResult extends BatchPreview {
  added: DownloadJob[];
}

/**
 * Returns waiting jobs in non-preemptive priority order, FIFO within each priority.
 * @param {DownloadJob[]} jobs - Newest-first persistent history.
 * @returns {DownloadJob[]} Scheduler order without mutating history.
 */
export function getQueueOrder(jobs: DownloadJob[]): DownloadJob[] {
  return jobs
    .toReversed()
    .filter((job) => job.status === DOWNLOAD_STATUS.queued)
    .sort((first, second) => (second.priority ?? JOB_PRIORITY.normal) - (first.priority ?? JOB_PRIORITY.normal));
}
