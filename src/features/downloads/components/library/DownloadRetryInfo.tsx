import type { DownloadJob } from '../../../../../shared/contracts';
import { DOWNLOAD_STATUS } from '../../../../../shared/contracts';
import { DOWNLOAD_RETRY } from '../../../../../shared/downloadRetry';

/** Explains retained-progress retry timing using the browser's local timezone.
 * @param {object} props - Existing transfer and durable retry metadata.
 * @param {DownloadJob} props.job - Live retry state without private transport diagnostics.
 * @returns {JSX.Element | null} Retry timing and pause guidance, or no retry history.
 */
export function DownloadRetryInfo({ job }: { job: DownloadJob }) {
  const { retry } = job;
  if (
    !retry ||
    job.status === DOWNLOAD_STATUS.cancelled ||
    (retry.attempts === 0 && (job.status === DOWNLOAD_STATUS.completed || job.status === DOWNLOAD_STATUS.downloading))
  ) {
    return null;
  }
  const until = new Date(retry.nextAttemptAt ?? retry.cooldownUntil).toLocaleString();
  const scheduled = job.status === DOWNLOAD_STATUS.queued;
  const paused = job.status === DOWNLOAD_STATUS.paused;
  const completed = job.status === DOWNLOAD_STATUS.completed;
  return (
    <aside
      className="media-recovery"
      aria-label={`Retry status for ${job.filename}`}
    >
      {scheduled ? (
        <p>
          {retry.nextAttemptAt
            ? `Automatic retry ${retry.attempts}/${DOWNLOAD_RETRY.maximumAttempts}`
            : 'Source cooldown'}{' '}
          · eligible after {until}. Waiting releases the download slot.
        </p>
      ) : paused ? (
        <p>Automatic retries are paused. Resume keeps saved progress and respects source cooldowns.</p>
      ) : completed ? (
        retry.attempts > 0 && (
          <p>
            Recovered after {retry.attempts} automatic {retry.attempts === 1 ? 'retry' : 'retries'}.
          </p>
        )
      ) : job.status === DOWNLOAD_STATUS.downloading ? (
        retry.attempts > 0 && (
          <p>
            Automatic retry {retry.attempts}/{DOWNLOAD_RETRY.maximumAttempts} in progress.
          </p>
        )
      ) : (
        <p>
          {retry.attempts >= DOWNLOAD_RETRY.maximumAttempts
            ? 'Automatic retry limit reached. Use Test connection before restarting.'
            : `Automatic retry stopped. Source cooldown ends ${until}. Review the source before restarting.`}
        </p>
      )}
      {scheduled && (
        <small>Pause or cancel to stop automatic attempts. Daily windows and storage holds still apply.</small>
      )}
    </aside>
  );
}
