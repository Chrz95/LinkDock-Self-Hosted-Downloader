import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../../shared/contracts';
import { MEDIA_FAILURE_INFO } from '../../../../../shared/mediaFailures';
import { PAGE_INFO } from '../../../../app/navigation';
interface MediaRecoveryProps {
  job: DownloadJob;
}
/**
 * Shows application-authored recovery hints without displaying raw engine output or triggering automatic retries.
 * @param {MediaRecoveryProps} props - Failed media job.
 * @param {DownloadJob} props.job - Persisted safe failure category and original source link.
 * @returns {JSX.Element | null} Recovery guidance tailored to recognized diagnostic hints.
 */
export function MediaRecovery({ job }: MediaRecoveryProps) {
  if (job.status !== DOWNLOAD_STATUS.failed || !job.mediaFailure) {
    return null;
  }
  const information = MEDIA_FAILURE_INFO[job.mediaFailure];
  return (
    <aside
      className="media-recovery"
      aria-label={`Recovery for ${job.filename}`}
    >
      <h4>{information.title}</h4>
      <p>{information.guidance}</p>
      {['browser', 'tools', 'settings'].includes(information.action) && (
        <a href={PAGE_INFO.settings.href}>
          {information.action === 'tools' ? 'Review utilities in Settings' : 'Open source settings'}
        </a>
      )}
      {information.action === 'source' && (
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          Open original source
        </a>
      )}
      <small>Suggested from the engine response. Site errors can be ambiguous.</small>
    </aside>
  );
}
