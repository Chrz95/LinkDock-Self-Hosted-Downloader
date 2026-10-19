import { useMemo, useState } from 'react';
import type { DownloadArtifact } from '../../../../shared/sources';
import { COLLECTION_PAGE_SIZE, FILE_KIND, FILE_SORT, fileKind } from '../../../../shared/fileBrowser';
import type { FileKind, FileSort } from '../../../../shared/fileBrowser';
/**
 * Filters and sorts an indexed copy, preserving original manifest positions for every delivery URL.
 * @param {DownloadArtifact[]} files - Immutable published manifest.
 * @returns {object} Bounded visible page and independent collection controls.
 */
export function useCollectionBrowser(files: DownloadArtifact[]) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<FileKind>(FILE_KIND.all);
  const [sort, setSort] = useState<FileSort>(FILE_SORT.name);
  const [page, setPage] = useState(0);
  const [filterKey, setFilterKey] = useState('');
  const currentKey = JSON.stringify([query, kind, sort]);
  // Keep filter changes on page one even if the preceding filter had many pages.
  if (filterKey !== currentKey) {
    setFilterKey(currentKey);
    setPage(0);
  }
  const matches = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return files
      .map((file, fileIndex) => ({ file, fileIndex }))
      .filter(
        ({ file }) =>
          (!search ||
            file.name.toLocaleLowerCase().includes(search) ||
            file.relativePath.toLocaleLowerCase().includes(search)) &&
          (kind === FILE_KIND.all || fileKind(file.name) === kind),
      )
      .sort((first, second) => {
        const names = first.file.name.localeCompare(second.file.name, undefined, { numeric: true });
        if (sort === FILE_SORT.largest || sort === FILE_SORT.smallest) {
          const bytes =
            sort === FILE_SORT.largest
              ? second.file.sizeBytes - first.file.sizeBytes
              : first.file.sizeBytes - second.file.sizeBytes;
          return bytes || names || first.fileIndex - second.fileIndex;
        }
        return (sort === FILE_SORT.reverseName ? -names : names) || first.fileIndex - second.fileIndex;
      });
  }, [files, query, kind, sort]);
  const pages = Math.max(1, Math.ceil(matches.length / COLLECTION_PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const start = currentPage * COLLECTION_PAGE_SIZE;
  return {
    query,
    setQuery,
    kind,
    setKind,
    sort,
    setSort,
    setPage,
    page: currentPage,
    pages,
    matches: matches.length,
    total: files.length,
    start,
    visible: matches.slice(start, start + COLLECTION_PAGE_SIZE),
  };
}
