import { LIBRARY_FILTER } from '../../../../shared/library';
import type { DownloadJob } from '../../../../shared/contracts';

/**
 * Matches organization and search together without changing queue execution.
 * @param {DownloadJob} job - Live or retained transfer.
 * @param {string} query - Filename, folder or tag search text.
 * @param {string} folder - Collision-safe folder selector value.
 * @param {string} tag - Case-insensitive tag selector value.
 * @returns {boolean} Whether every selected condition matches.
 */
export function matchesLibrary(job: DownloadJob, query: string, folder: string, tag: string): boolean {
  const metadata = job.library ?? { folder: '', tags: [] };
  const matchesFolder =
    !folder ||
    (folder === LIBRARY_FILTER.unfiled
      ? !metadata.folder
      : folder === `${LIBRARY_FILTER.folderPrefix}${metadata.folder}`);
  const matchesTag = !tag || metadata.tags.some((label) => label.toLowerCase() === tag.toLowerCase());
  const text = [job.filename, metadata.folder, ...metadata.tags].join(' ').toLowerCase();
  return matchesFolder && matchesTag && text.includes(query.trim().toLowerCase());
}

/**
 * Builds stable native-selector options; active selections remain visible even if their last job disappears.
 * @param {DownloadJob[]} jobs - All retained jobs.
 * @param {string} folder - Currently selected folder.
 * @param {string} tag - Currently selected tag.
 * @returns {object} Sorted folder values and canonical tag labels.
 */
export function getLibraryOptions(jobs: DownloadJob[], folder: string, tag: string) {
  const folders = new Set(jobs.map((job) => job.library?.folder).filter((value): value is string => Boolean(value)));
  if (folder.startsWith(LIBRARY_FILTER.folderPrefix)) {
    folders.add(folder.slice(LIBRARY_FILTER.folderPrefix.length));
  }
  const tags = new Map<string, string>();
  for (const job of jobs) {
    for (const label of job.library?.tags ?? []) {
      if (!tags.has(label.toLowerCase())) {
        tags.set(label.toLowerCase(), label);
      }
    }
  }
  if (tag && !tags.has(tag)) {
    tags.set(tag, tag);
  }
  return {
    folders: [...folders].sort((first, second) => first.localeCompare(second)),
    tags: [...tags].sort((first, second) => first[1].localeCompare(second[1])),
  };
}
