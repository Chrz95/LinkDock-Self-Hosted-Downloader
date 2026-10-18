import type { DownloadListProps } from './DownloadList.types';
import { useBulkLibrary } from '../hooks/useBulkLibrary';
import { BulkLibraryBar } from './library/BulkLibraryBar';
import { useLibraryView } from '../hooks/useLibraryView';
import { LibraryViewControls } from './library/LibraryViewControls';
import { LibraryItem } from './library/LibraryItem';
import { DownloadEmpty } from './library/DownloadEmpty';

/**
 * Filters the collection while preserving server execution and unsaved label drafts across polling.
 * @param {DownloadListProps} props - Queue and mutation behavior.
 * @param {DownloadJob[]} props.jobs - All retained transfers.
 * @param {string | null} props.busyJobId - Identifier awaiting a mutation response.
 * @param {DownloadListProps['onAction']} props.onAction - Transfer mutation.
 * @param {OrganizeDownload} [props.onOrganize] - Saves library organization.
 * @param {MutateLibrary} [props.onBulk] - Applies reviewed bulk commands.
 * @returns {JSX.Element} Filterable transfer collection.
 */
export function DownloadList({ jobs, busyJobId, onAction, onOrganize, onBulk }: DownloadListProps) {
  const view = useLibraryView(jobs);
  const selection = useBulkLibrary(view.visibleJobs, onBulk);
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
      <LibraryViewControls
        view={view}
        selection={selection}
      />
      <p className="queue-hint">Waiting jobs run High → Normal → Low, oldest first within each level.</p>
      {onBulk && (
        <BulkLibraryBar
          visibleJobs={view.visibleJobs}
          selection={selection}
        />
      )}
      {view.visibleJobs.length ? (
        <ul className="download-list">
          {view.visibleJobs.map((job) => (
            <LibraryItem
              key={job.id}
              job={job}
              isBusy={busyJobId === job.id}
              onAction={onAction}
              onOrganize={onOrganize}
              selection={onBulk ? selection : undefined}
            />
          ))}
        </ul>
      ) : (
        <DownloadEmpty hasFilters={view.hasFilters} />
      )}
    </section>
  );
}
