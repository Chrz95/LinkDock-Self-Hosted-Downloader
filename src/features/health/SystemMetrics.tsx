import { SYSTEM_LIMIT, type SystemHealth } from '../../../shared/health';
import { formatBytes } from '../../lib/format/bytes';
import { formatUptime } from './StationMetrics';

interface SystemMetricsProps {
  system: SystemHealth | undefined;
}
/**
 * Separates OS-visible counters from LinkDock process measurements and container resource limits.
 * @param {SystemMetricsProps} props - Recent optional system measurements.
 * @param {SystemHealth | undefined} props.system - Cached OS snapshot or an older backend's missing field.
 * @returns {JSX.Element} Responsive system metrics with explicit unavailable readings.
 */
export function SystemMetrics({ system }: SystemMetricsProps) {
  if (!system) {
    return <p className="policy-footnote">System measurements are unavailable. Update the station and refresh.</p>;
  }
  const metrics = [
    ['Visible CPU threads', system.cpuThreads === null ? 'Unavailable' : String(system.cpuThreads)],
    [
      'Load average · 1 / 5 / 15 min',
      system.loadAverage === null
        ? 'Unavailable'
        : system.loadAverage.map((value) => value.toFixed(SYSTEM_LIMIT.loadDigits)).join(' / '),
    ],
    ['System uptime', system.uptimeSeconds === null ? 'Unavailable' : formatUptime(system.uptimeSeconds)],
    ['System memory total', system.memory.totalBytes === null ? 'Unavailable' : formatBytes(system.memory.totalBytes)],
    ['System memory free', system.memory.freeBytes === null ? 'Unavailable' : formatBytes(system.memory.freeBytes)],
    [
      'CPU temperature',
      system.temperature.celsius === null
        ? 'Unavailable'
        : `${system.temperature.celsius.toFixed(SYSTEM_LIMIT.temperatureDigits)} °C`,
    ],
  ];
  return (
    <section
      className="system-metrics"
      aria-labelledby="system-metrics-title"
    >
      <h3 id="system-metrics-title">System view</h3>
      <p className="policy-footnote">
        OS-visible readings can describe the host or a virtual machine. They are separate from LinkDock's process
        readings and Docker CPU/memory limits. Load averages describe system activity, not CPU utilization percentages.
      </p>
      <dl className="health-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="policy-footnote">{system.temperature.detail}</p>
      <p className="health-timestamp">
        System readings: <time dateTime={system.checkedAt}>{new Date(system.checkedAt).toLocaleString()}</time> · Cached
        for up to five seconds. Refresh to update.
      </p>
    </section>
  );
}
