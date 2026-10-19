import type { DownloadArtifact } from '../../../../../shared/sources';
import { useCollectionBrowser } from '../../hooks/useCollectionBrowser';
import { CollectionControls } from './CollectionControls';
import { ArtifactRow } from './ArtifactRow';
interface CollectionBrowserProps {
  jobId: string;
  files: DownloadArtifact[];
}
/**
 * Renders one bounded page, with canonical file links retained after search, sort and pagination.
 * @param {CollectionBrowserProps} props - Published collection identity.
 * @param {string} props.jobId - Server-owned job UUID.
 * @param {DownloadArtifact[]} props.files - Original complete manifest.
 * @returns {JSX.Element} Searchable file collection and accessible page controls.
 */
export function CollectionBrowser({ jobId, files }: CollectionBrowserProps) {
  const browser = useCollectionBrowser(files);
  return (
    <div className="collection-browser">
      <CollectionControls browser={browser} />
      <p
        className="collection-count"
        aria-live="polite"
      >
        {browser.matches
          ? `${browser.start + 1}–${browser.start + browser.visible.length} of ${browser.matches}`
          : 'No matching files'}{' '}
        · {browser.total} total files
      </p>
      {browser.matches ? (
        <ul>
          {browser.visible.map(({ file, fileIndex }) => (
            <ArtifactRow
              key={`${fileIndex}:${file.relativePath}`}
              jobId={jobId}
              file={file}
              fileIndex={fileIndex}
            />
          ))}
        </ul>
      ) : (
        <p className="collection-empty">Try another name or file type. The complete collection is still in the ZIP.</p>
      )}
      <nav
        className="collection-pagination"
        aria-label="File pages"
      >
        <button
          type="button"
          disabled={browser.page === 0}
          onClick={() => browser.setPage(browser.page - 1)}
        >
          Previous files
        </button>
        <span>
          Page {browser.page + 1} of {browser.pages}
        </span>
        <button
          type="button"
          disabled={browser.page + 1 >= browser.pages}
          onClick={() => browser.setPage(browser.page + 1)}
        >
          Next files
        </button>
      </nav>
    </div>
  );
}
