import type { SourceType, DownloadQuality } from '../../../../../shared/sources';
import type { BatchResult } from '../../../../../shared/batch';
/** Composer callbacks keep transient form state independent of server execution. */
export interface AddDownloadProps {
  onAdd: (url: string, sourceType?: SourceType, quality?: DownloadQuality) => Promise<void>;
  onUpload?: (file: File) => Promise<void>;
  onBatch?: (urls: string[], sourceType?: SourceType, quality?: DownloadQuality) => Promise<BatchResult>;
}
