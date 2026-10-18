import type { DownloadJob, JobAction } from '../../../../shared/contracts';
import type { OrganizeDownload } from '../../../../shared/library';
import type { MutateLibrary } from '../../../../shared/bulkLibrary';

/** Queue list commands remain optional for read-only embedded views. */
export interface DownloadListProps {
  jobs: DownloadJob[];
  busyJobId: string | null;
  onAction: (jobId: string, action: JobAction | 'delete') => Promise<void>;
  onOrganize?: OrganizeDownload;
  onBulk?: MutateLibrary;
}
