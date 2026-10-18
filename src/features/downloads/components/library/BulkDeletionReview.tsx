import { useEffect, useRef } from 'react';
import type { BulkLibraryState } from '../../hooks/useBulkLibrary';
import { formatBytes } from '../../utils/formatDownload';

interface BulkDeletionReviewProps {
  selection: BulkLibraryState;
}
/**
 * Reviews fixed filenames and bytes before a separately activated permanent deletion command.
 * @param {BulkDeletionReviewProps} props - Frozen review and commands.
 * @param {BulkLibraryState} props.selection - Selected records with a captured review snapshot.
 * @returns {JSX.Element} Inline keyboard-reachable destructive review.
 */
export function BulkDeletionReview({ selection }: BulkDeletionReviewProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const jobs = selection.review ?? [];
  const bytes = jobs.reduce((total, job) => total + job.receivedBytes, 0);
  return (
    <section
      className="bulk-deletion-review"
      aria-labelledby="bulk-delete-title"
    >
      <h3
        id="bulk-delete-title"
        tabIndex={-1}
        ref={heading}
      >
        Delete {jobs.length} downloads permanently?
      </h3>
      <p>Remove these records and their saved files from your station. This cannot be undone.</p>
      <p>{formatBytes(bytes)} recorded across the selection; actual disk space released may differ.</p>
      <ul aria-label="Downloads to delete">
        {jobs.map((job) => (
          <li key={job.id}>{job.filename}</li>
        ))}
      </ul>
      <div className="bulk-buttons">
        <button
          type="button"
          onClick={selection.cancelReview}
          disabled={selection.isBusy}
        >
          Keep downloads
        </button>
        <button
          type="button"
          className="bulk-danger"
          onClick={() => void selection.confirmDeletion()}
          disabled={selection.isBusy}
        >
          {selection.isBusy ? 'Deleting…' : `Permanently delete ${jobs.length} downloads`}
        </button>
      </div>
    </section>
  );
}
