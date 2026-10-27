import type { DownloadDiagnostic } from '../../../../../shared/diagnostics';
import { PAGE_INFO } from '../../../../app/navigation';

const STATE_LABEL = {
  passed: 'Passed',
  failed: 'Needs attention',
  info: 'Information',
  skipped: 'Not tested',
} as const;
const JSON_INDENT = 2;
/** Creates an export only on explicit request and releases its temporary browser URL.
 * @param {DownloadDiagnostic} report - Sanitized server report, never the job or source URL.
 */
function downloadReport(report: DownloadDiagnostic): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, JSON_INDENT)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'LinkDock-diagnostic.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
interface DiagnosticResultsProps {
  report: DownloadDiagnostic;
  sourceUrl: string;
}
/** Presents fixed server explanations and an export that excludes the separate original-source link.
 * @param {DiagnosticResultsProps} props - Safe report and local navigation link.
 * @param {DownloadDiagnostic} props.report - Whitelisted diagnostic fields only.
 * @param {string} props.sourceUrl - Existing source for the owner's browser, excluded from JSON.
 * @returns {JSX.Element} Accessible report and downloadable JSON.
 */
export function DiagnosticResults({ report, sourceUrl }: DiagnosticResultsProps) {
  return (
    <section
      className="diagnostic-results"
      aria-label="Connection check results"
      aria-live="polite"
    >
      <p>
        Checked {new Date(report.checkedAt).toLocaleString()} · DNS: {report.dnsMode}
      </p>
      <ul>
        {report.checks.map((check) => (
          <li
            key={check.id}
            className={`diagnostic-${check.state}`}
          >
            <strong>
              {check.label} — {STATE_LABEL[check.state]}
            </strong>
            <p>{check.detail}</p>
            {check.action === 'settings' && check.state === 'failed' && (
              <a href={PAGE_INFO.settings.href}>Review settings</a>
            )}
            {check.action === 'source' && check.state === 'failed' && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                Check original source
              </a>
            )}
          </li>
        ))}
      </ul>
      <p>
        This checks the source page with saved cookies and the station route. The HTTP client differs from the
        extractor; API access, media files and full downloads are not tested. Results are reused for one minute.
      </p>
      <button
        type="button"
        className="text-button"
        onClick={() => downloadReport(report)}
      >
        Download diagnostic report
      </button>
      <small>The report excludes source URLs, IP addresses, paths, cookies and tokens.</small>
    </section>
  );
}
