import { useId } from 'react';
import { FILE_KINDS, FILE_SORTS, type FileKind, type FileSort } from '../../../../../shared/fileBrowser';
import type { useCollectionBrowser } from '../../hooks/useCollectionBrowser';
interface CollectionControlsProps {
  browser: ReturnType<typeof useCollectionBrowser>;
}
/**
 * Labels all file filters independently from the outer download-library search.
 * @param {CollectionControlsProps} props - Current file view.
 * @param {ReturnType<typeof useCollectionBrowser>} props.browser - Search, type and ordering state.
 * @returns {JSX.Element} Responsive controls with native keyboard and touch support.
 */
export function CollectionControls({ browser }: CollectionControlsProps) {
  const id = useId();
  return (
    <div className="collection-controls">
      <label htmlFor={`${id}-query`}>
        Find files in this download
        <input
          id={`${id}-query`}
          type="search"
          value={browser.query}
          placeholder="Search file or folder name"
          onChange={(event) => browser.setQuery(event.target.value)}
        />
      </label>
      <label htmlFor={`${id}-kind`}>
        File type
        <select
          id={`${id}-kind`}
          value={browser.kind}
          onChange={(event) => browser.setKind(event.target.value as FileKind)}
        >
          {FILE_KINDS.map((kind) => (
            <option
              key={kind.value}
              value={kind.value}
            >
              {kind.label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-sort`}>
        Sort files
        <select
          id={`${id}-sort`}
          value={browser.sort}
          onChange={(event) => browser.setSort(event.target.value as FileSort)}
        >
          {FILE_SORTS.map((sort) => (
            <option
              key={sort.value}
              value={sort.value}
            >
              {sort.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
