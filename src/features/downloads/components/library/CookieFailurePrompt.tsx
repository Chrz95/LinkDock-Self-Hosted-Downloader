import { useState } from 'react';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../../shared/contracts';
import { MEDIA_FAILURE } from '../../../../../shared/mediaFailures';
import { CookieHelpDialog } from './CookieHelpDialog';

/** Identifies a failure attempt so polling never reopens a dismissed popup.
 * @param {DownloadJob} job - Current queue record.
 * @returns {string} Non-secret attempt identity, independent of URL and error text.
 */
export function cookieFailureKey(job: DownloadJob): string {
  return JSON.stringify([job.id, job.finishedAt]);
}
/** Shows one account-session failure at a time across all workspace pages.
 * @param {object} props - Authenticated queue snapshot.
 * @returns {JSX.Element | null} Recovery popup until this failure attempt is dismissed.
 */
export function CookieFailurePrompt({ jobs }: { jobs: DownloadJob[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const job = jobs.find(
    (candidate) =>
      candidate.status === DOWNLOAD_STATUS.failed &&
      candidate.mediaFailure === MEDIA_FAILURE.login &&
      !dismissed.includes(cookieFailureKey(candidate)),
  );
  return job ? (
    <CookieHelpDialog
      key={cookieFailureKey(job)}
      job={job}
      onClose={() => setDismissed((previous) => [...previous, cookieFailureKey(job)])}
    />
  ) : null;
}
