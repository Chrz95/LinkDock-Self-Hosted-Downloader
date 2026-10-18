import type { DownloadJob, JobAction } from '../../../../shared/contracts';
import type { OrganizeDownload } from '../../../../shared/library';
import { useLibraryView } from '../hooks/useLibraryView';
import { DownloadToolbar } from './DownloadToolbar';
import { LibraryFilters } from './library/LibraryFilters';
import { LibraryItem } from './library/LibraryItem';
import { DownloadEmpty } from './library/DownloadEmpty';

/** Queue list inputs owned by the station hook. */
interface DownloadListProps {
  jobs: DownloadJob[];
  busyJobId: string | null;
  onAction: (jobId: string, action: JobAction | 'delete') => Promise<void>;
  onOrganize?: OrganizeDownload;
}
/**
 * Filters the collection while preserving server execution and unsaved label drafts across polling.
 * @param {DownloadListProps} props - Queue and mutation behavior.
 * @param {DownloadJob[]} props.jobs - All retained transfers.
 * @param {string | null} props.busyJobId - Identifier awaiting a mutation response.
 * @param {DownloadListProps['onAction']} props.onAction - Transfer mutation.
 * @param {OrganizeDownload} [props.onOrganize] - Saves library organization.
 * @returns {JSX.Element} Filterable transfer collection.
 */
export function DownloadList({ jobs, busyJobId, onAction, onOrganize }: DownloadListProps) {
  const view = useLibraryView(jobs);
  return (
    <section
      id="downloads"
      className="downloads-section"
      aria-labelledby="downloads-title"
    >
      <div className="section-heading">
        <h2 id="downloads-title">
          Your downloads <span>{jobs.length}</span>
        </h2>
        <span className="live-indicator">
          <span className="status-dot" /> LIVE QUEUE
        </span>
      </div>
      <DownloadToolbar
        selectedFilter={view.selectedFilter}
        searchQuery={view.searchQuery}
        onFilterChange={view.setSelectedFilter}
        onSearchChange={view.setSearchQuery}
      />
      <LibraryFilters
        folders={view.options.folders}
        tags={view.options.tags}
        folder={view.folder}
        tag={view.tag}
        visibleCount={view.visibleJobs.length}
        totalCount={jobs.length}
        hasFilters={view.hasFilters}
        onFolderChange={view.setFolder}
        onTagChange={view.setTag}
        onReset={view.clearFilters}
      />
      <p className="queue-hint">Waiting jobs run High → Normal → Low, oldest first within each level.</p>
      {view.visibleJobs.length ? (
        <ul className="download-list">
          {view.visibleJobs.map((job) => (
            <LibraryItem
              key={job.id}
              job={job}
              isBusy={busyJobId === job.id}
              onAction={onAction}
              onOrganize={onOrganize}
            />
          ))}
        </ul>
      ) : (
        <DownloadEmpty hasFilters={view.hasFilters} />
      )}
    </section>
  );
}
