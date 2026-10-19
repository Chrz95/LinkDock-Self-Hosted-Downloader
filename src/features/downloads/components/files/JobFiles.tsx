import { useState } from 'react';
import type { DownloadJob } from '../../../../../shared/contracts';
import { DOWNLOAD_STATUS } from '../../../../../shared/contracts';
import { Icon } from '../../../../components/ui/Icon';
import { ArchiveDownload } from './ArchiveDownload';
import { CollectionBrowser } from './CollectionBrowser';

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
  const [open, setOpen] = useState(false);
  if (job.status !== DOWNLOAD_STATUS.completed || !job.files || job.files.length <= 1) {
    return null;
  }
  return (
    <details
      className="job-files"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Icon name="grid" />
        View {job.files.length} files
      </summary>
      {open && (
        <div>
          <ArchiveDownload jobId={job.id} />
          <p className="collection-zip-note">ZIP includes every saved file, regardless of the filters below.</p>
          <CollectionBrowser
            jobId={job.id}
            files={job.files}
          />
        </div>
      )}
    </details>
  );
}
