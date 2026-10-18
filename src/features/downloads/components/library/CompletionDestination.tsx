import { useState } from 'react';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../../shared/contracts';
import { JOB_OPTIONS } from '../../../../../shared/jobOptions';
import { useJobOption } from './useJobOption';

interface CompletionDestinationProps {
  job: DownloadJob;
}
/**
 * Chooses a physical folder beneath the configured completion root and exposes safe move recovery.
 * @param {CompletionDestinationProps} props - Current job.
 * @param {DownloadJob} props.job - Live destination and publication state.
 * @returns {JSX.Element} Accessible completion folder editor.
 */
export function CompletionDestination({ job }: CompletionDestinationProps) {
  const saved = job.destination?.directory ?? '';
  const [draft, setDirectory] = useState<string | null>(null);
  const directory = draft ?? saved;
  const option = useJobOption(job.id);
  const locked = Boolean(job.destination?.moved || (job.payloadReady && job.destination));
  return (
    <details className="organization-editor completion-destination">
      <summary>
        {job.destination?.error
          ? `Move needs attention · ${saved}`
          : job.destination?.moved
            ? `Saved to ${saved}`
            : 'Move on completion'}
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void option.save(JOB_OPTIONS.destination, { directory: directory || null }, 'Completion destination saved.');
        }}
      >
        <fieldset disabled={option.busy || locked}>
          <legend className="visually-hidden">Completion destination for {job.filename}</legend>
          <label>
            Destination folder
            <input
              type="text"
              value={directory}
              maxLength={JOB_OPTIONS.maximumDirectoryCharacters}
              placeholder="Movies or Media/Travel"
              autoComplete="off"
              onChange={(event) => setDirectory(event.target.value)}
            />
          </label>
          <p>Override for this job. Use . for the completion root, or a subfolder. Clear to keep files in transfers.</p>
          <button
            type="submit"
            disabled={directory === saved}
          >
            {option.busy ? 'Saving…' : 'Save destination'}
          </button>
        </fieldset>
        {job.destination?.moved && <p>Move complete · browser downloads, previews and ZIP exports remain available.</p>}
        {job.destination?.error && (
          <p
            role="alert"
            className="form-error"
          >
            {job.destination.error}
          </p>
        )}
        {job.destination && !job.destination.moved && job.status === DOWNLOAD_STATUS.completed && (
          <button
            type="button"
            disabled={option.busy}
            onClick={() => void option.save(JOB_OPTIONS.retryMove, {}, 'Move queued using saved files.')}
          >
            Retry move
          </button>
        )}
        {option.message && <output className="policy-saved">{option.message}</output>}
        {option.error && (
          <p
            role="alert"
            className="form-error"
          >
            {option.error}
          </p>
        )}
      </form>
    </details>
  );
}
