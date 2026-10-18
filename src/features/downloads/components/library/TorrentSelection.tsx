import { useState } from 'react';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../../shared/contracts';
import { JOB_OPTIONS } from '../../../../../shared/jobOptions';
import { formatBytes } from '../../../../lib/format/bytes';
import { useJobOption } from './useJobOption';
interface TorrentSelectionProps {
  job: DownloadJob;
}
/**
 * Reviews one-based torrent entries before any content is requested.
 * @param {TorrentSelectionProps} props - Selection state.
 * @param {DownloadJob} props.job - Torrent or magnet job.
 * @returns {JSX.Element | null} Mobile file checklist or saved selection summary.
 */
export function TorrentSelection({ job }: TorrentSelectionProps) {
  const [indexes, setIndexes] = useState<number[]>([]);
  const option = useJobOption(job.id);
  const selection = job.torrentSelection;
  if (!selection) {
    return null;
  }
  const files = selection.files ?? [];
  const selected = selection.selected ?? indexes;
  const bytes = files.filter((file) => selected.includes(file.index)).reduce((sum, file) => sum + file.sizeBytes, 0);
  return (
    <details
      className="organization-editor torrent-selection"
      open={Boolean(files.length && !selection.selected)}
    >
      <summary>{selection.selected ? 'Selected torrent files' : 'Choose torrent files'}</summary>
      {!files.length ? (
        <p>File names appear after metadata is retrieved from the torrent or peers.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void option.save(JOB_OPTIONS.torrent, { indexes }, 'File selection saved. Download queued.');
          }}
        >
          <fieldset disabled={option.busy || Boolean(selection.selected)}>
            <legend>
              {selected.length} of {files.length} files · {formatBytes(bytes)}
            </legend>
            <div className="organization-actions">
              <button
                type="button"
                onClick={() => setIndexes(files.map((file) => file.index))}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setIndexes([])}
              >
                Clear selection
              </button>
            </div>
            <div className="torrent-file-list">
              {files.map((file) => (
                <label key={file.index}>
                  <input
                    type="checkbox"
                    checked={selected.includes(file.index)}
                    onChange={(event) =>
                      setIndexes(
                        event.target.checked
                          ? [...indexes, file.index]
                          : indexes.filter((index) => index !== file.index),
                      )
                    }
                  />
                  <span>
                    {file.name}
                    <small>{formatBytes(file.sizeBytes)}</small>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="submit"
              disabled={!indexes.length || job.status !== DOWNLOAD_STATUS.paused || Boolean(option.message)}
            >
              {option.busy ? 'Saving selection…' : 'Download selected files'}
            </button>
          </fieldset>
          {selection.selected && <p>Selection is locked while downloading. Restart a paused job to choose again.</p>}
          {option.message && <output className="policy-saved">{option.message}</output>}
          {option.error && (
            <p
              role="alert"
              className="form-error"
            >
              {option.error}
            </p>
          )}
        </form>
      )}
    </details>
  );
}
