import { DOWNLOAD_STATUS, JOB_ACTION } from '../../../../shared/contracts';
import { Icon } from '../../../components/ui/Icon';
import { ACTION_LABEL } from '../constants';
import type { DownloadRowProps } from './DownloadRow.types';

/**
 * Separates retaining progress from explicitly discarding it and starting again.
 * @param {DownloadRowProps} props - Transfer and lifecycle commands.
 * @param {DownloadJob} props.job - Existing record.
 * @param {boolean} props.isBusy - Whether a mutation is pending.
 * @param {DownloadRowProps['onAction']} props.onAction - Validated server mutation.
 * @returns {JSX.Element} Pause, resume, restart and cancel controls.
 */
export function TransferControls({ job, isBusy, onAction }: DownloadRowProps) {
  const isActive = job.status === DOWNLOAD_STATUS.downloading || job.status === DOWNLOAD_STATUS.queued;
  const isPaused = job.status === DOWNLOAD_STATUS.paused;
  const needsSelection = isPaused && job.torrentSelection?.files && !job.torrentSelection.selected;
  const action = isActive ? JOB_ACTION.pause : isPaused ? JOB_ACTION.resume : JOB_ACTION.retry;
  return (
    <div className="row-actions">
      <button
        type="button"
        className="icon-button"
        disabled={isBusy || Boolean(needsSelection)}
        onClick={() => void onAction(job.id, action)}
        aria-label={`${ACTION_LABEL[action]} ${job.filename}`}
        title={needsSelection ? 'Choose torrent files below to continue' : `${ACTION_LABEL[action]} download`}
      >
        <Icon name={isActive ? 'pause' : isPaused ? 'play' : 'retry'} />
      </button>
      {isPaused && (
        <button
          type="button"
          className="icon-button"
          disabled={isBusy}
          onClick={() => void onAction(job.id, JOB_ACTION.retry)}
          aria-label={`Restart ${job.filename} from the beginning`}
          title="Discard partial progress and restart"
        >
          <Icon name="retry" />
        </button>
      )}
      {(isActive || isPaused) && (
        <button
          type="button"
          className="icon-button"
          disabled={isBusy}
          onClick={() => void onAction(job.id, JOB_ACTION.cancel)}
          aria-label={`Cancel ${job.filename}`}
          title="Cancel and discard partial progress"
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
