import { SOURCE_LABEL, SOURCE_TYPE, SOURCE_URL, isGallerySource } from '../../../../shared/sources';
import { CompletedFiles } from './files/CompletedFiles';
import { DOWNLOAD_STATUS } from '../../../../shared/contracts';
import { Icon } from '../../../components/ui/Icon';
import { DISPLAY, STATUS_LABEL } from '../constants';
import { formatBytes, getProgressPercent } from '../utils/formatDownload';
import { DownloadActions } from './DownloadActions';
import { DeleteDownload } from './DeleteDownload';
import type { DownloadRowProps } from './DownloadRow.types';

/**
 * Renders one transfer with real byte progress and state-specific actions.
 * @param {DownloadRowProps} props - Transfer presentation and callbacks.
 * @param {DownloadJob} props.job - Live transfer record.
 * @param {boolean} props.isBusy - Mutation pending state.
 * @param {(jobId: string, action: JobAction | 'delete') => Promise<void>} props.onAction - Queue mutation.
 * @returns {JSX.Element} Semantic list item for one download.
 */
export function DownloadRow({ job, isBusy, onAction }: DownloadRowProps) {
  const isDownloading = job.status === DOWNLOAD_STATUS.downloading;
  const isTerminal = job.status !== DOWNLOAD_STATUS.queued && !isDownloading;
  const progress = getProgressPercent(job);
  const source = job.sourceType ?? SOURCE_TYPE.direct;
  const hostname =
    source === SOURCE_TYPE.magnet
      ? 'Peer-to-peer network'
      : job.url.startsWith(SOURCE_URL.uploadedTorrent)
        ? 'Uploaded torrent'
        : new URL(job.url).hostname;
  return (
    <article
      className="download-row"
      aria-label={job.filename}
    >
      <span className={`file-icon ${job.status}`}>
        <Icon
          name={
            source === SOURCE_TYPE.video
              ? 'video'
              : isGallerySource(source)
                ? 'camera'
                : source === SOURCE_TYPE.torrent || source === SOURCE_TYPE.magnet
                  ? 'torrent'
                  : 'file'
          }
        />
      </span>
      <div className="file-information">
        <div className="file-title">
          <h3 title={job.filename}>{job.filename}</h3>
          <span className={`status-badge ${job.status}`}>{STATUS_LABEL[job.status]}</span>
        </div>
        <p className="file-source">
          {SOURCE_LABEL[source]} <span>·</span> {hostname} <span>·</span> {formatBytes(job.totalBytes)}
        </p>
        {isDownloading && (
          <div className="transfer-progress">
            <progress
              max={DISPLAY.percent}
              value={progress}
              aria-label={`Download progress for ${job.filename}`}
            />
            <div>
              <span>{formatBytes(job.receivedBytes)} received</span>
              <span>
                {formatBytes(job.bytesPerSecond)}/s {progress === undefined ? '' : `· ${Math.floor(progress)}%`}
              </span>
            </div>
          </div>
        )}
        {job.status !== DOWNLOAD_STATUS.completed && job.stage && (
          <p className="job-stage">
            {job.stage}
            {job.peers !== undefined && <span> · {job.peers} peers</span>}
          </p>
        )}
        <CompletedFiles job={job} />
        {job.errorMessage && <p className="transfer-error">{job.errorMessage}</p>}
      </div>
      <div className="file-controls">
        <DownloadActions
          job={job}
          isBusy={isBusy}
          onAction={onAction}
        />
        {isTerminal && (
          <DeleteDownload
            job={job}
            isBusy={isBusy}
            onAction={onAction}
          />
        )}
      </div>
    </article>
  );
}
