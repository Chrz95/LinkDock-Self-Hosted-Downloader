import { useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import type { DownloadRowProps } from './DownloadRow.types';

/**
 * Requires a second click before permanently deleting the stored file and its queue record.
 * @param {DownloadRowProps} props - Terminal transfer controls.
 * @param {DownloadJob} props.job - Download to delete.
 * @param {boolean} props.isBusy - Whether another mutation is pending.
 * @param {(jobId: string, action: JobAction | 'delete') => Promise<void>} props.onAction - Deletes the transfer.
 * @returns {JSX.Element} Explicit deletion confirmation.
 */
export function DeleteDownload({ job, isBusy, onAction }: DownloadRowProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  return (
    <div className="delete-control">
      {isConfirming ? (
        <div className="delete-confirmation">
          <button
            className="danger-button"
            type="button"
            disabled={isBusy}
            onClick={() => void onAction(job.id, 'delete')}
          >
            Delete file &amp; record
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setIsConfirming(false)}
          >
            Keep
          </button>
        </div>
      ) : (
        <button
          className="icon-button delete-button"
          type="button"
          disabled={isBusy}
          onClick={() => setIsConfirming(true)}
          aria-label={`Delete ${job.filename}`}
          title="Delete file and record"
        >
          <Icon name="trash" />
        </button>
      )}
    </div>
  );
}
