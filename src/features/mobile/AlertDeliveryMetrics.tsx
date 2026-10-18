import type { AlertDeliveryStatus } from '../../../shared/notifications';

interface AlertDeliveryMetricsProps {
  status: AlertDeliveryStatus;
}
/**
 * Shows aggregate station-wide scheduling counts without exposing another device's registration.
 * @param {AlertDeliveryMetricsProps} props - Latest private snapshot.
 * @param {AlertDeliveryStatus} props.status - Counts and earliest scheduled attempt.
 * @returns {JSX.Element} Compact responsive metric grid.
 */
export function AlertDeliveryMetrics({ status }: AlertDeliveryMetricsProps) {
  return (
    <dl className="health-metrics">
      <div>
        <dt>Pending deliveries</dt>
        <dd>{status.pending}</dd>
      </div>
      <div>
        <dt>With previous attempts</dt>
        <dd>{status.retrying}</dd>
      </div>
      <div>
        <dt>Sending now</dt>
        <dd>{status.sending}</dd>
      </div>
      <div>
        <dt>Next scheduled attempt</dt>
        <dd>{status.nextAttemptAt ? new Date(status.nextAttemptAt).toLocaleString() : 'None pending'}</dd>
      </div>
    </dl>
  );
}
