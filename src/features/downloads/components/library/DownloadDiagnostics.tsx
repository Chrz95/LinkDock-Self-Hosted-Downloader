import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../../shared/contracts';
import { SOURCE_TYPE } from '../../../../../shared/sources';
import { useDownloadDiagnostic } from './useDownloadDiagnostic';
import { DiagnosticResults } from './DiagnosticResults';

interface DownloadDiagnosticsProps {
  job: DownloadJob;
}
/** Adds an explicit diagnostic beside failed downloads without retrying or changing their queue state.
 * @param {DownloadDiagnosticsProps} props - Existing failed download.
 * @param {DownloadJob} props.job - Source and stable job identifier.
 * @returns {JSX.Element | null} Connection action and independently loaded results.
 */
export function DownloadDiagnostics({ job }: DownloadDiagnosticsProps) {
  const diagnostic = useDownloadDiagnostic(job.id);
  if (
    job.status !== DOWNLOAD_STATUS.failed ||
    job.sourceType === SOURCE_TYPE.torrent ||
    job.sourceType === SOURCE_TYPE.magnet
  ) {
    return null;
  }
  return (
    <aside
      className="media-recovery download-diagnostics"
      aria-label={`Diagnostics for ${job.filename}`}
    >
      <button
        type="button"
        className="text-button"
        disabled={diagnostic.busy}
        onClick={() => void diagnostic.run()}
      >
        {diagnostic.busy ? 'Checking connection…' : 'Test connection'}
      </button>
      <p>Check the station network, saved account setup, storage and active download engine.</p>
      {diagnostic.error && (
        <p
          className="form-error"
          role="alert"
        >
          {diagnostic.error}
        </p>
      )}
      {diagnostic.report && (
        <DiagnosticResults
          report={diagnostic.report}
          sourceUrl={job.url}
        />
      )}
    </aside>
  );
}
