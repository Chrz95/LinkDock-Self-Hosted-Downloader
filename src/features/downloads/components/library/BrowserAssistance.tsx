import { MEDIA_FAILURE } from '../../../../../shared/mediaFailures';
import { useState } from 'react';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../../shared/contracts';
import { SOURCE_TYPE } from '../../../../../shared/sources';
import { JOB_OPTIONS } from '../../../../../shared/jobOptions';
import { PAGE_INFO } from '../../../../app/navigation';
import { useJobOption } from './useJobOption';

interface BrowserAssistanceProps {
  job: DownloadJob;
}
/**
 * Lets the owner complete verification/countdowns and explicitly queue the resulting file link.
 * @param {BrowserAssistanceProps} props - Failed or canceled non-torrent job.
 * @param {DownloadJob} props.job - Original source, never an engine credential or executable.
 * @returns {JSX.Element | null} Browser handoff and final-link form when relevant.
 */
export function BrowserAssistance({ job }: BrowserAssistanceProps) {
  const [url, setUrl] = useState('');
  const option = useJobOption(job.id);
  if (
    (job.status !== DOWNLOAD_STATUS.failed && job.status !== DOWNLOAD_STATUS.cancelled) ||
    job.payloadReady ||
    (job.mediaFailure !== undefined &&
      job.mediaFailure !== MEDIA_FAILURE.verification &&
      job.mediaFailure !== MEDIA_FAILURE.login &&
      job.mediaFailure !== MEDIA_FAILURE.access &&
      job.mediaFailure !== MEDIA_FAILURE.unknown) ||
    job.sourceType === SOURCE_TYPE.torrent ||
    job.sourceType === SOURCE_TYPE.magnet
  ) {
    return null;
  }
  return (
    <details className="organization-editor browser-assistance">
      <summary>Browser assistance</summary>
      <p>Open the source, complete any CAPTCHA and wait for the site’s countdown.</p>
      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
      >
        Open source in browser
      </a>
      <p>
        For a verified session, import site cookies in <a href={PAGE_INFO.settings.href}>Settings</a>, then use Restart.
        Some verification is bound to your browser/IP and cannot be reused on the Pi.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void option.save(
            JOB_OPTIONS.browserLink,
            { url },
            'Final link queued as a new download. Original record retained.',
          );
        }}
      >
        <fieldset disabled={option.busy}>
          <legend className="visually-hidden">Browser-resolved file link</legend>
          <label>
            Final file URL
            <input
              type="url"
              required
              value={url}
              autoComplete="off"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://host.example/file?..."
            />
          </label>
          <button type="submit">{option.busy ? 'Queuing…' : 'Queue final file link'}</button>
        </fieldset>
      </form>
      <p>
        Paste the final HTTP/HTTPS file URL, not the countdown page or a blob: URL. Signed links can expire. The new
        download uses your global completion setting. Existing partial data is not reused.
      </p>
      {option.message && <output className="organization-saved">{option.message}</output>}
      {option.error && (
        <p
          className="form-error"
          role="alert"
        >
          {option.error}
        </p>
      )}
    </details>
  );
}
