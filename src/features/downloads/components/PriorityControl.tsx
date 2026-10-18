import { DOWNLOAD_STATUS, JOB_ACTION } from '../../../../shared/contracts';
import { JOB_PRIORITY, type JobPriority } from '../../../../shared/batch';
import type { DownloadRowProps } from './DownloadRow.types';

/** Scheduling choices are distinct from lifecycle changes such as pause and resume. */
const PRIORITY_OPTIONS = [
  { value: JOB_PRIORITY.high, label: 'High', action: JOB_ACTION.priorityHigh },
  { value: JOB_PRIORITY.normal, label: 'Normal', action: JOB_ACTION.priorityNormal },
  { value: JOB_PRIORITY.low, label: 'Low', action: JOB_ACTION.priorityLow },
] as const;

/**
 * Offers touch and keyboard accessible priorities without requiring drag-and-drop.
 * @param {DownloadRowProps} props - Transfer and mutation controls.
 * @param {DownloadJob} props.job - Waiting or paused download.
 * @param {boolean} props.isBusy - Pending mutation state.
 * @param {DownloadRowProps['onAction']} props.onAction - Validated scheduling command.
 * @returns {JSX.Element | null} Waiting-job priority selector.
 */
export function PriorityControl({ job, isBusy, onAction }: DownloadRowProps) {
  if (job.status !== DOWNLOAD_STATUS.queued && job.status !== DOWNLOAD_STATUS.paused) {
    return null;
  }
  return (
    <label className="priority-control">
      <span>Priority</span>
      <select
        aria-label={`Queue priority for ${job.filename}`}
        value={job.priority ?? JOB_PRIORITY.normal}
        disabled={isBusy}
        onChange={(event) => {
          const priority = Number(event.target.value) as JobPriority;
          const option = PRIORITY_OPTIONS.find((entry) => entry.value === priority);
          if (option) {
            void onAction(job.id, option.action);
          }
        }}
      >
        {PRIORITY_OPTIONS.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
