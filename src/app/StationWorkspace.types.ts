import type { DashboardSnapshot, JobAction } from '../../shared/contracts';
import type { SourceType, DownloadQuality } from '../../shared/sources';
import type { BatchResult } from '../../shared/batch';
import type { OrganizeDownload } from '../../shared/library';
import type { MutateLibrary } from '../../shared/bulkLibrary';
import type { WorkspacePage } from './navigation';
/** Authenticated workspace data and queue commands. */
export interface StationWorkspaceProps {
  page: WorkspacePage;
  snapshot: DashboardSnapshot;
  busyJobId: string | null;
  onAdd: (url: string, sourceType?: SourceType, quality?: DownloadQuality) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onAction: (jobId: string, action: JobAction | 'delete') => Promise<void>;
  onBatch?: (urls: string[], sourceType?: SourceType, quality?: DownloadQuality) => Promise<BatchResult>;
  onOrganize?: OrganizeDownload;
  onBulk?: MutateLibrary;
}
