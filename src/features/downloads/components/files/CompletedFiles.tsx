import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../../shared/contracts';
import { JobFiles } from './JobFiles';
import { MediaPreview } from './MediaPreview';

/** Both legacy direct files and single/multiple engine artifacts support completed delivery. */
interface CompletedFilesProps {
  job: DownloadJob;
}
/**
 * Keeps unfinished file bytes private and adds a single-file preview without crowding transfer actions.
 * @param {CompletedFilesProps} props - Retained transfer.
 * @param {DownloadJob} props.job - Current job and optional published manifest.
 * @returns {JSX.Element | null} Completed file tools only.
 */
export function CompletedFiles({ job }: CompletedFilesProps) {
  if (job.status !== DOWNLOAD_STATUS.completed) {
    return null;
  }
  if ((job.files?.length ?? 0) > 1) {
    return <JobFiles job={job} />;
  }
  const file = job.files?.[0];
  return (
    <MediaPreview
      jobId={job.id}
      filename={file?.name ?? job.filename}
      sizeBytes={file?.sizeBytes ?? job.receivedBytes}
    />
  );
}
