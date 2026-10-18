import type { StationHealthSnapshot } from '../../../shared/health';
import { HEALTH_LIMIT } from '../../../shared/health';
import { formatBytes } from '../../lib/format/bytes';

/** Read-only real station diagnostics. */
interface StationMetricsProps {
  snapshot: StationHealthSnapshot;
}
/**
 * Formats process uptime without implying host or physical Pi uptime.
 * @param {number} seconds - Current Node process age.
 * @returns {string} Compact hours and minutes.
 */
export function formatUptime(seconds: number): string {
  const minutes = Math.floor(seconds / HEALTH_LIMIT.secondsPerMinute);
  return minutes < 1
    ? '<1m'
    : `${Math.floor(minutes / HEALTH_LIMIT.minutesPerHour)}h ${minutes % HEALTH_LIMIT.minutesPerHour}m`;
}
/**
 * Shows process metrics and filesystem capacity with clear container boundaries.
 * @param {StationMetricsProps} props - Recent station snapshot.
 * @param {StationHealthSnapshot} props.snapshot - Process and volume measurements.
 * @returns {JSX.Element} Accessible measurement definitions.
 */
export function StationMetrics({ snapshot }: StationMetricsProps) {
  const metrics = [
    ['Runtime', `Node ${snapshot.runtime.node}`],
    ['Environment', `${snapshot.runtime.platform} / ${snapshot.runtime.architecture}`],
    ['Station uptime', formatUptime(snapshot.runtime.uptimeSeconds)],
    [
      'Process memory',
      snapshot.runtime.memoryBytes === null ? 'Unavailable' : formatBytes(snapshot.runtime.memoryBytes),
    ],
    [
      'Storage available',
      snapshot.storage.availableBytes === null ? 'Unavailable' : formatBytes(snapshot.storage.availableBytes),
    ],
    [
      'Filesystem capacity',
      snapshot.storage.totalBytes === null ? 'Unavailable' : formatBytes(snapshot.storage.totalBytes),
    ],
    ['Running / waiting / paused', `${snapshot.queue.active} / ${snapshot.queue.waiting} / ${snapshot.queue.paused}`],
  ];
  return (
    <div>
      <dl className="health-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className={snapshot.storage.writable ? 'policy-footnote' : 'form-error'}>{snapshot.storage.detail}</p>
      {snapshot.queue.holdReason && <p className="health-hold">Queue hold: {snapshot.queue.holdReason}</p>}
    </div>
  );
}
