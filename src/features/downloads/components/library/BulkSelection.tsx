import type { DownloadJob } from '../../../../../shared/contracts';
import { BULK_LIBRARY } from '../../../../../shared/bulkLibrary';
import type { BulkLibraryState } from '../../hooks/useBulkLibrary';

interface BulkSelectionProps {
  job: DownloadJob;
  selection: BulkLibraryState;
}
/**
 * Adds a touch-sized, individually named checkbox with a bounded selection count.
 * @param {BulkSelectionProps} props - Visible record and current selection.
 * @param {DownloadJob} props.job - Row represented by this checkbox.
 * @param {BulkLibraryState} props.selection - Explicit IDs and selection commands.
 * @returns {JSX.Element} Accessible row selector.
 */
export function BulkSelection({ job, selection }: BulkSelectionProps) {
  const checked = selection.ids.includes(job.id);
  return (
    <label className="bulk-row-selection">
      <input
        type="checkbox"
        checked={checked}
        disabled={selection.isBusy || (!checked && selection.selectedJobs.length >= BULK_LIBRARY.maximum)}
        onChange={() => selection.toggle(job.id)}
        aria-label={`Select ${job.filename}`}
      />
      <span>{checked ? 'Selected' : 'Select download'}</span>
    </label>
  );
}
