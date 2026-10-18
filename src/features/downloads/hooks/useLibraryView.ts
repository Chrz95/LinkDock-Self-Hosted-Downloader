import { useState } from 'react';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../shared/contracts';
import { getQueueOrder } from '../../../../shared/batch';
import { getLibraryOptions, matchesLibrary } from '../utils/libraryView';
import { matchesFilter } from '../utils/formatDownload';
import type { DownloadFilter } from '../constants';

/**
 * Keeps local library views independent of the station's persistent scheduling state.
 * @param {DownloadJob[]} jobs - Current retained history.
 * @returns {object} Controlled filters, derived options and scheduler-aware results.
 */
export function useLibraryView(jobs: DownloadJob[]) {
  const [selectedFilter, setSelectedFilter] = useState<DownloadFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [tag, setTag] = useState('');
  const ordered =
    selectedFilter === 'active'
      ? [
          ...jobs.filter((job) => job.status === DOWNLOAD_STATUS.downloading),
          ...getQueueOrder(jobs),
          ...jobs.filter((job) => job.status === DOWNLOAD_STATUS.paused),
        ]
      : jobs;
  const visibleJobs = ordered.filter(
    (job) => matchesFilter(job, selectedFilter) && matchesLibrary(job, searchQuery, folder, tag),
  );
  const options = getLibraryOptions(jobs, folder, tag);
  const hasFilters = Boolean(searchQuery || folder || tag || selectedFilter !== 'all');
  /** Returns to the complete collection without mutating any saved organization. */
  function clearFilters(): void {
    setSelectedFilter('all');
    setSearchQuery('');
    setFolder('');
    setTag('');
  }
  return {
    selectedFilter,
    setSelectedFilter,
    searchQuery,
    setSearchQuery,
    folder,
    setFolder,
    tag,
    setTag,
    visibleJobs,
    totalCount: jobs.length,
    options,
    hasFilters,
    clearFilters,
  };
}
