import type { BrowserPage } from '../../shared/stationBrowser';

interface BrowserPreviewProps {
  page: BrowserPage;
  busy: boolean;
  onOpen: (url: string) => void;
  onQueue: (url: string) => void;
}

/** Renders fetched data as text and exposes explicit navigation and queue actions.
 * @param {BrowserPreviewProps} props - Page snapshot and browser actions.
 * @returns {JSX.Element} Static page preview.
 */
export function BrowserPreview({ page, busy, onOpen, onQueue }: BrowserPreviewProps) {
  return (
    <div className="settings-card">
      <h2>{page.title}</h2>
      <p className="browser-url">{page.url}</p>
      {page.file && (
        <button
          disabled={busy}
          onClick={() => onQueue(page.url)}
        >
          Queue file
        </button>
      )}
      {page.text && <p className="browser-text">{page.text}</p>}
      {page.truncated && <p>This page exceeds the browser’s preview limits.</p>}
      {page.links.length > 0 && (
        <ul aria-label="Page links">
          {page.links.map((link) => (
            <li key={link.url}>
              <button
                title={link.url}
                disabled={busy}
                onClick={() => onOpen(link.url)}
              >
                {link.label}
              </button>
              <button
                disabled={busy}
                aria-label={`Queue ${link.label}`}
                onClick={() => onQueue(link.url)}
              >
                {link.download ? 'Queue file' : 'Queue'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
