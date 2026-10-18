import type { DownloadJob } from '../../../../../shared/contracts';
import { DOWNLOAD_STATUS } from '../../../../../shared/contracts';
import { Icon } from '../../../../components/ui/Icon';
import { ArchiveDownload } from './ArchiveDownload';
import { ArtifactRow } from './ArtifactRow';

/** Completed file manifest belonging to a single transfer. */
interface JobFilesProps {
  job: DownloadJob;
}
/**
 * Makes every carousel or torrent artifact independently accessible, with an optional streamed archive.
 * @param {JobFilesProps} props - Completed transfer.
 * @param {DownloadJob} props.job - Job and its server-created file manifest.
 * @returns {JSX.Element | null} Expandable file collection with previews and download actions.
 */
export function JobFiles({ job }: JobFilesProps) {
  if (job.status !== DOWNLOAD_STATUS.completed || !job.files || job.files.length <= 1) {
    return null;
  }
  return (
    <details className="job-files">
      <summary>
        <Icon name="grid" />
        View {job.files.length} files
      </summary>
      <ArchiveDownload jobId={job.id} />
      <ul>
        {job.files.map((file, fileIndex) => (
          <ArtifactRow
            key={file.relativePath}
            jobId={job.id}
            file={file}
            fileIndex={fileIndex}
          />
        ))}
      </ul>
    </details>
  );
}
