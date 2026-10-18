import { Icon } from '../../../components/ui/Icon';
import { DOWNLOAD_FILTERS, type DownloadFilter } from '../constants';

/** User-controlled filtering and search. */
export interface DownloadToolbarProps {
  selectedFilter: DownloadFilter;
  searchQuery: string;
  onFilterChange: (filter: DownloadFilter) => void;
  onSearchChange: (query: string) => void;
}
/**
 * Offers accessible queue filters and filename search without changing server execution.
 * @param {DownloadToolbarProps} props - Current controls and callbacks.
 * @param {DownloadFilter} props.selectedFilter - Visible status group.
 * @param {string} props.searchQuery - Filename query.
 * @param {(filter: DownloadFilter) => void} props.onFilterChange - Selects a status group.
 * @param {(query: string) => void} props.onSearchChange - Updates filename search.
 * @returns {JSX.Element} Queue toolbar.
 */
export function DownloadToolbar({ selectedFilter, searchQuery, onFilterChange, onSearchChange }: DownloadToolbarProps) {
  return (
    <div className="download-toolbar">
      <div
        className="filters"
        aria-label="Filter downloads"
      >
        {DOWNLOAD_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            aria-pressed={selectedFilter === filter.id}
            onClick={() => onFilterChange(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <label className="search-field">
        <Icon name="search" />
        <span className="visually-hidden">Search downloads</span>
        <input
          type="search"
          enterKeyHint="search"
          placeholder="Search files, folders, tags…"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
    </div>
  );
}
