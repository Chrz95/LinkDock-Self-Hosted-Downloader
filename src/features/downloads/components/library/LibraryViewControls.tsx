import { DownloadToolbar } from '../DownloadToolbar';
import { LibraryFilters } from './LibraryFilters';
import type { useLibraryView } from '../../hooks/useLibraryView';
import type { BulkLibraryState } from '../../hooks/useBulkLibrary';

interface LibraryViewControlsProps {
  view: ReturnType<typeof useLibraryView>;
  selection: BulkLibraryState;
}
/**
 * Invalidates selection before any filter change while retaining stable row components and label drafts.
 * @param {LibraryViewControlsProps} props - Controlled filters and selection lifecycle.
 * @param {ReturnType<typeof useLibraryView>} props.view - Current visible collection and setters.
 * @param {BulkLibraryState} props.selection - Selection invalidation and in-flight lock.
 * @returns {JSX.Element} Accessible search, status and label controls.
 */
export function LibraryViewControls({ view, selection }: LibraryViewControlsProps) {
  return (
    <fieldset
      className="library-view-controls"
      disabled={selection.isBusy}
    >
      <legend className="visually-hidden">Filter downloads</legend>
      <DownloadToolbar
        selectedFilter={view.selectedFilter}
        searchQuery={view.searchQuery}
        onFilterChange={(value) => {
          selection.clear();
          view.setSelectedFilter(value);
        }}
        onSearchChange={(value) => {
          selection.clear();
          view.setSearchQuery(value);
        }}
      />
      <LibraryFilters
        folders={view.options.folders}
        tags={view.options.tags}
        folder={view.folder}
        tag={view.tag}
        visibleCount={view.visibleJobs.length}
        totalCount={view.totalCount}
        hasFilters={view.hasFilters}
        onFolderChange={(value) => {
          selection.clear();
          view.setFolder(value);
        }}
        onTagChange={(value) => {
          selection.clear();
          view.setTag(value);
        }}
        onReset={() => {
          selection.clear();
          view.clearFilters();
        }}
      />
    </fieldset>
  );
}
