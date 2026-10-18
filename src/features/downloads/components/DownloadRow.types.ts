import type { DownloadJob, JobAction } from '../../../../shared/contracts';
/** A transfer presentation and its controlled mutation state. */
export interface DownloadRowProps {
  job: DownloadJob;
  isBusy: boolean;
  onAction: (jobId: string, action: JobAction | 'delete') => Promise<void>;
}
