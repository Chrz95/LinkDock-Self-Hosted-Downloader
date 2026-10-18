import { LIBRARY_LIMIT } from '../../../../../shared/library';
import { TAG_MODE, type TagMode } from '../../../../../shared/bulkLibrary';
import type { BulkOrganizationDraft } from '../../hooks/useBulkOrganization';

interface BulkLabelFieldsProps {
  draft: BulkOrganizationDraft;
}
/**
 * Uses opt-in changes so a mixed selection keeps its individual folders and tags by default.
 * @param {BulkLabelFieldsProps} props - Controlled fields.
 * @param {BulkOrganizationDraft} props.draft - Optional changes and setters.
 * @returns {JSX.Element} Responsive label fields.
 */
export function BulkLabelFields({ draft }: BulkLabelFieldsProps) {
  return (
    <div className="bulk-label-fields">
      <label className="bulk-folder-toggle">
        <input
          type="checkbox"
          checked={draft.changeFolder}
          onChange={(event) => draft.setChangeFolder(event.target.checked)}
        />
        Change folder for all selected
      </label>
      {draft.changeFolder && (
        <label>
          New folder · leave empty for Unfiled
          <input
            type="text"
            value={draft.folder}
            maxLength={LIBRARY_LIMIT.folderCharacters}
            list="library-folder-options"
            autoComplete="off"
            onChange={(event) => draft.setFolder(event.target.value)}
          />
        </label>
      )}
      <label>
        Tag changes
        <select
          value={draft.tagMode}
          onChange={(event) => draft.setTagMode(event.target.value as TagMode | '')}
        >
          <option value="">Keep current tags</option>
          <option value={TAG_MODE.add}>Add tags</option>
          <option value={TAG_MODE.remove}>Remove tags</option>
          <option value={TAG_MODE.replace}>Replace all tags</option>
        </select>
      </label>
      {draft.tagMode && (
        <label>
          Tags, separated by commas
          <input
            type="text"
            value={draft.tags}
            maxLength={LIBRARY_LIMIT.inputCharacters}
            autoComplete="off"
            onChange={(event) => draft.setTags(event.target.value)}
          />
        </label>
      )}
      {draft.tagMode === TAG_MODE.replace && <p>Replacing with an empty field clears every selected job's tags.</p>}
    </div>
  );
}
