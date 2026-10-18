import type { DownloadJob } from '../../../../../shared/contracts';
import { BULK_LIBRARY, isBulkDeletable } from '../../../../../shared/bulkLibrary';
import type { BulkLibraryState } from '../../hooks/useBulkLibrary';
import { BulkOrganization } from './BulkOrganization';
import { BulkDeletionReview } from './BulkDeletionReview';

interface BulkLibraryBarProps {
  visibleJobs: DownloadJob[];
  selection: BulkLibraryState;
}
/**
 * Keeps bulk selection and outcomes visible in a compact wrapping toolbar on phones and desktops.
 * @param {BulkLibraryBarProps} props - Filtered rows and selection commands.
 * @param {DownloadJob[]} props.visibleJobs - Snapshot source for select-visible.
 * @param {BulkLibraryState} props.selection - Explicit membership and mutation feedback.
 * @returns {JSX.Element} Bulk action toolbar and optional review.
 */
export function BulkLibraryBar({ visibleJobs, selection }: BulkLibraryBarProps) {
  const count = selection.selectedJobs.length;
  const deletable = Boolean(count) && selection.selectedJobs.every(isBulkDeletable);
  return (
    <div className="bulk-library">
      <fieldset disabled={selection.isBusy}>
        <legend className="visually-hidden">Bulk library actions</legend>
        <div className="bulk-buttons">
          <span className="bulk-count">{count} selected</span>
          <button
            type="button"
            onClick={() => selection.selectVisible(visibleJobs)}
            disabled={!visibleJobs.length}
          >
            Select visible · up to {BULK_LIBRARY.maximum}
          </button>
          {count > 0 && (
            <button
              type="button"
              onClick={selection.clear}
            >
              Clear selection
            </button>
          )}
        </div>
        {count > 0 && !selection.review && (
          <div className="bulk-actions">
            <BulkOrganization
              key={selection.selectedJobs.map((job) => job.id).join(',')}
              selection={selection}
            />
            <button
              type="button"
              className="bulk-danger"
              disabled={!deletable}
              onClick={selection.reviewDeletion}
            >
              Review deletion
            </button>
            {!deletable && <p>Only finished downloads can be bulk-deleted. Active and paused jobs can be organized.</p>}
          </div>
        )}
        {selection.review && <BulkDeletionReview selection={selection} />}
      </fieldset>
      <div aria-live="polite">{selection.message && <p className="policy-saved">{selection.message}</p>}</div>
      {selection.error && <p role="alert">{selection.error}</p>}
      <p className="bulk-scope">Selection applies to visible downloads and clears when filters change.</p>
    </div>
  );
}
