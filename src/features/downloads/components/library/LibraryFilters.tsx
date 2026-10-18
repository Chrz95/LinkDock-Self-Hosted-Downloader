import { LIBRARY_FILTER } from '../../../../../shared/library';

import type { LibraryFiltersProps } from './LibraryFilters.types';
/**
 * Adds composable folder/tag facets and explicit filter reset.
 * @param {LibraryFiltersProps} props - Controlled collection filters.
 * @param {string[]} props.folders - Saved and selected folder labels.
 * @param {[string, string][]} props.tags - Canonical tag identifiers and display labels.
 * @param {string} props.folder - Selected folder value.
 * @param {string} props.tag - Selected tag identifier.
 * @param {number} props.visibleCount - Matching jobs.
 * @param {number} props.totalCount - All retained jobs.
 * @param {boolean} props.hasFilters - Whether reset changes the current view.
 * @param {(value: string) => void} props.onFolderChange - Selects a logical folder.
 * @param {(value: string) => void} props.onTagChange - Selects a tag.
 * @param {() => void} props.onReset - Clears all local filters.
 * @returns {JSX.Element} Folder/tag controls and result count.
 */
export function LibraryFilters({
  folders,
  tags,
  folder,
  tag,
  visibleCount,
  totalCount,
  hasFilters,
  onFolderChange,
  onTagChange,
  onReset,
}: LibraryFiltersProps) {
  return (
    <div className="library-filters">
      <label>
        Folder
        <select
          value={folder}
          onChange={(event) => onFolderChange(event.target.value)}
        >
          <option value={LIBRARY_FILTER.all}>All folders</option>
          <option value={LIBRARY_FILTER.unfiled}>Unfiled</option>
          {folders.map((label) => (
            <option
              key={label}
              value={`${LIBRARY_FILTER.folderPrefix}${label}`}
            >
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tag
        <select
          value={tag}
          onChange={(event) => onTagChange(event.target.value)}
        >
          <option value="">All tags</option>
          {tags.map(([value, label]) => (
            <option
              key={value}
              value={value}
            >
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="library-results">
        <output aria-live="polite">
          {visibleCount} of {totalCount} downloads
        </output>
        {hasFilters && (
          <button
            type="button"
            onClick={onReset}
          >
            Clear filters
          </button>
        )}
      </div>
      <datalist id="library-folder-options">
        {folders.map((label) => (
          <option
            key={label}
            value={label}
          >
            {label}
          </option>
        ))}
      </datalist>
    </div>
  );
}
