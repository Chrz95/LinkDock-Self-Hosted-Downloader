import { useState } from 'react';
import { CookieHelpDialog } from './CookieHelpDialog';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../../shared/contracts';
import { MEDIA_FAILURE_INFO } from '../../../../../shared/mediaFailures';
import { PAGE_INFO } from '../../../../app/navigation';
import { SOURCE_TYPE } from '../../../../../shared/sources';
import { MEDIA_FAILURE } from '../../../../../shared/mediaFailures';
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
  const [showHelp, setShowHelp] = useState(false);
  if (job.status !== DOWNLOAD_STATUS.failed || !job.mediaFailure) {
    return null;
  }
  const information = MEDIA_FAILURE_INFO[job.mediaFailure];
  return (
    <aside
      className="media-recovery"
      aria-label={`Recovery for ${job.filename}`}
    >
      {showHelp && (
        <CookieHelpDialog
          job={job}
          onClose={() => setShowHelp(false)}
        />
      )}
      {job.mediaFailure === MEDIA_FAILURE.login && (
        <button
          type="button"
          className="text-button"
          onClick={() => setShowHelp(true)}
        >
          Cookie connection instructions
        </button>
      )}
      <h4>{information.title}</h4>
      <p>{information.guidance}</p>
      {job.sourceType === SOURCE_TYPE.deviantart && job.mediaFailure === MEDIA_FAILURE.verification && (
        <p>
          DeviantArt browser or network checks are separate from OAuth authorization. This error does not remove saved
          account credentials. Check DeviantArt account connection and Browser sessions in Settings. Imported cookies
          may help, but some browser-bound or network blocks cannot be reused by the Pi.
        </p>
      )}
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
