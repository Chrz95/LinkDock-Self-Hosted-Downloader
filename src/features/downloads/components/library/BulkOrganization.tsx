import type { BulkLibraryState } from '../../hooks/useBulkLibrary';
import { useBulkOrganization } from '../../hooks/useBulkOrganization';
import { BulkLabelFields } from './BulkLabelFields';
import { LIBRARY_LIMIT } from '../../../../../shared/library';

interface BulkOrganizationProps {
  selection: BulkLibraryState;
}
/**
 * Applies partial folder and tag changes together after complete client and server validation.
 * @param {BulkOrganizationProps} props - Explicit selection.
 * @param {BulkLibraryState} props.selection - Current records and atomic save behavior.
 * @returns {JSX.Element} Compact opt-in bulk editor.
 */
export function BulkOrganization({ selection }: BulkOrganizationProps) {
  const draft = useBulkOrganization(selection);
  return (
    <details className="bulk-organization">
      <summary>Organize selected</summary>
      <form onSubmit={(event) => void draft.save(event)}>
        <BulkLabelFields draft={draft} />
        <p>Unchanged fields keep each download's own labels. Up to {LIBRARY_LIMIT.tags} tags per download.</p>
        <button
          type="submit"
          disabled={selection.isBusy || (!draft.changeFolder && !draft.tagMode)}
        >
          {selection.isBusy ? 'Saving…' : `Apply labels to ${selection.selectedJobs.length} downloads`}
        </button>
        {draft.error && <p role="alert">{draft.error}</p>}
      </form>
    </details>
  );
}
