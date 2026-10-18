import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../shared/contracts';
import { DISPLAY, type DownloadFilter } from '../constants';

export { formatBytes } from '../../../lib/format/bytes';

/**
 * Determines queue membership without comparing raw status strings in components.
 * @param {DownloadJob} job - Transfer being evaluated.
 * @param {DownloadFilter} filter - Selected queue view.
 * @returns {boolean} Whether the job belongs to the view.
 */
export function matchesFilter(job: DownloadJob, filter: DownloadFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'active') {
    return (
      job.status === DOWNLOAD_STATUS.downloading ||
      job.status === DOWNLOAD_STATUS.queued ||
      job.status === DOWNLOAD_STATUS.paused
    );
  }
  if (filter === 'failed') {
    return job.status === DOWNLOAD_STATUS.failed || job.status === DOWNLOAD_STATUS.cancelled;
  }
  return job.status === DOWNLOAD_STATUS.completed;
}

/**
 * Calculates bounded progress, retaining indeterminate behavior for unknown totals.
 * @param {DownloadJob} job - Transfer progress record.
 * @returns {number | undefined} Percentage or undefined for unknown size.
 */
export function getProgressPercent(job: DownloadJob): number | undefined {
  if (job.status === DOWNLOAD_STATUS.completed) {
    return DISPLAY.percent;
  }
  return job.totalBytes ? Math.min(DISPLAY.percent, (job.receivedBytes / job.totalBytes) * DISPLAY.percent) : undefined;
}
