import type { OrganizeDownload } from '../../../../../shared/library';
import type { DownloadRowProps } from '../DownloadRow.types';
import { DownloadRow } from '../DownloadRow';
import { OrganizationEditor } from './OrganizationEditor';
import type { BulkLibraryState } from '../../hooks/useBulkLibrary';
import { BulkSelection } from './BulkSelection';
import { TorrentSelection } from './TorrentSelection';
import { CompletionDestination } from './CompletionDestination';
import { MediaRecovery } from './MediaRecovery';
import { MediaVersion } from './MediaVersion';
import { CollectionScope } from './CollectionScope';
import { BrowserAssistance } from './BrowserAssistance';

/** A semantic collection item contains its transfer controls and independently saved labels. */
interface LibraryItemProps extends DownloadRowProps {
  onOrganize?: OrganizeDownload;
  selection?: BulkLibraryState;
}
/**
 * Preserves transfer actions while placing organization below the row on all screen sizes.
 * @param {LibraryItemProps} props - Transfer and label commands.
 * @param {DownloadJob} props.job - Live job and saved labels.
 * @param {boolean} props.isBusy - Transfer command in flight.
 * @param {DownloadRowProps['onAction']} props.onAction - Transfer action.
 * @param {OrganizeDownload} [props.onOrganize] - Optional label persistence.
 * @param {BulkLibraryState} [props.selection] - Optional explicit bulk selection.
 * @returns {JSX.Element} Accessible library list item.
 */
export function LibraryItem({ job, isBusy, onAction, onOrganize, selection }: LibraryItemProps) {
  return (
    <li className={`library-item${selection?.ids.includes(job.id) ? ' is-selected' : ''}`}>
      {selection && (
        <BulkSelection
          job={job}
          selection={selection}
        />
      )}
      <fieldset
        className="library-item-actions"
        disabled={selection?.isBusy}
      >
        <DownloadRow
          job={job}
          isBusy={isBusy}
          onAction={onAction}
        />
        <div className="library-organization">
          {job.library?.folder || job.library?.tags.length ? (
            <ul
              className="library-labels"
              aria-label={`Labels for ${job.filename}`}
            >
              {job.library.folder && <li className="folder-label">{job.library.folder}</li>}
              {job.library.tags.map((tag) => (
                <li key={tag}>#{tag}</li>
              ))}
            </ul>
          ) : null}
          {onOrganize && (
            <OrganizationEditor
              job={job}
              onSave={onOrganize}
            />
          )}
        </div>
        <TorrentSelection
          key={`${job.id}:${Boolean(job.torrentSelection?.selected)}`}
          job={job}
        />
        <CompletionDestination job={job} />
        <CollectionScope job={job} />
        <MediaRecovery job={job} />
        <MediaVersion job={job} />
        <BrowserAssistance job={job} />
      </fieldset>
    </li>
  );
}
