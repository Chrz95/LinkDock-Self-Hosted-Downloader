import { API_PATH, DOWNLOAD_PATH, DOWNLOAD_STATUS } from '../../../../shared/contracts';
import { Icon } from '../../../components/ui/Icon';
import type { DownloadRowProps } from './DownloadRow.types';
import { TransferControls } from './TransferControls';
import { PriorityControl } from './PriorityControl';

/**
 * Presents only valid lifecycle actions; removal requires a separate explicit confirmation in the row.
 * @param {DownloadRowProps} props - Transfer and mutation controls.
 * @param {DownloadJob} props.job - Existing transfer.
 * @param {boolean} props.isBusy - Whether a mutation is awaiting its response.
 * @param {(jobId: string, action: JobAction | 'delete') => Promise<void>} props.onAction - Mutation callback.
 * @returns {JSX.Element} Transfer actions.
 */
export function DownloadActions({ job, isBusy, onAction }: DownloadRowProps) {
  return (
    <div className="row-actions">
      <PriorityControl
        job={job}
        isBusy={isBusy}
        onAction={onAction}
      />
      {job.status === DOWNLOAD_STATUS.completed && (job.files?.length ?? 1) <= 1 && (
        <a
          href={`${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.file}`}
          className="icon-button"
          aria-label={`Save ${job.filename} to this device`}
          title="Save to this device"
        >
          <Icon name="download" />
        </a>
      )}
      {job.status !== DOWNLOAD_STATUS.completed && (
        <TransferControls
          job={job}
          isBusy={isBusy}
          onAction={onAction}
        />
      )}
    </div>
  );
}
