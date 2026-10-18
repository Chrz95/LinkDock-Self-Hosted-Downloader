import type { DashboardSnapshot, JobAction } from '../../shared/contracts';
import type { SourceType, VideoQuality } from '../../shared/sources';
import type { BatchResult } from '../../shared/batch';
import type { OrganizeDownload } from '../../shared/library';
import type { MutateLibrary } from '../../shared/bulkLibrary';
/** Authenticated workspace data and queue commands. */
export interface StationWorkspaceProps {
  snapshot: DashboardSnapshot;
  busyJobId: string | null;
  onAdd: (url: string, sourceType?: SourceType, quality?: VideoQuality) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onAction: (jobId: string, action: JobAction | 'delete') => Promise<void>;
  onBatch?: (urls: string[], sourceType?: SourceType, quality?: VideoQuality) => Promise<BatchResult>;
  onOrganize?: OrganizeDownload;
  onBulk?: MutateLibrary;
}
