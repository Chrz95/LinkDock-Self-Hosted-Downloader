import { DOWNLOAD_STATUS, type DashboardSnapshot } from '../../../../shared/contracts';
import { Icon } from '../../../components/ui/Icon';
import { formatBytes } from '../utils/formatDownload';

/** Queue metrics use real server data, never illustrative placeholders. */
interface OverviewProps {
  snapshot: DashboardSnapshot;
}
/**
 * Summarizes active work, finished transfers and aggregate throughput.
 * @param {OverviewProps} props - Live dashboard state.
 * @param {DashboardSnapshot} props.snapshot - Server snapshot.
 * @returns {JSX.Element} Three responsive metric cards.
 */
export function Overview({ snapshot }: OverviewProps) {
  const activeCount = snapshot.jobs.filter((job) => job.status === DOWNLOAD_STATUS.downloading).length;
  const completedCount = snapshot.jobs
    .filter((job) => job.status === DOWNLOAD_STATUS.completed)
    .reduce((total, job) => total + (job.files?.length ?? 1), 0);
  const totalSpeed = snapshot.jobs.reduce((sum, job) => sum + job.bytesPerSecond, 0);
  return (
    <section
      className="overview"
      aria-label="Download overview"
    >
      <div className="metric">
        <span className="metric-label">
          <Icon name="download" /> Downloading
        </span>
        <div className="metric-value">
          {activeCount}
          <span>/ {snapshot.concurrency} slots</span>
        </div>
        <span className="metric-foot">{activeCount ? 'Your station is on it' : 'Ready when you are'}</span>
      </div>
      <div className="metric">
        <span className="metric-label">
          <Icon name="check" /> Completed
        </span>
        <div className="metric-value">
          {completedCount}
          <span>files</span>
        </div>
        <span className="metric-foot">Safe and sound, on your station</span>
      </div>
      <div className="metric">
        <span className="metric-label">
          <Icon name="arrow" /> Transfer speed
        </span>
        <div className="metric-value speed-value">
          {formatBytes(totalSpeed)}
          <span>/s</span>
        </div>
        <span className="metric-foot">Across active transfers</span>
      </div>
    </section>
  );
}
