import { OUTBOX_LIMIT } from '../../../shared/notifications';
import { useAlertDelivery } from './useAlertDelivery';
import { AlertDeliveryMetrics } from './AlertDeliveryMetrics';

/**
 * Offers a lazy private backlog snapshot and deliberate clear action without sending external messages.
 * @returns {JSX.Element} Mobile-compatible delivery disclosure and status controls.
 */
export function AlertDelivery() {
  const delivery = useAlertDelivery();
  return (
    <details
      className="alert-delivery"
      onToggle={(event) => delivery.setIsOpen(event.currentTarget.open)}
    >
      <summary>Alert delivery · all registered devices</summary>
      {delivery.isOpen && (
        <div className="alert-delivery-content">
          <p className="policy-footnote">
            Pending generic alerts survive a station restart. Temporary failures retry up to{' '}
            {OUTBOX_LIMIT.maximumAttempts} attempts and leave the backlog after one hour. Bursts may share one alert.
          </p>
          {delivery.status &&
            (delivery.status.available ? (
              <AlertDeliveryMetrics status={delivery.status} />
            ) : (
              <p className="policy-footnote">{delivery.status.reason}</p>
            ))}
          {delivery.updatedAt && (
            <p className="policy-footnote">
              Snapshot at {delivery.updatedAt}, in your device's time. Refresh to update.
            </p>
          )}
          <div className="policy-actions">
            <button
              type="button"
              className="text-button"
              disabled={delivery.isBusy}
              onClick={() => void delivery.refresh()}
            >
              {delivery.isBusy ? 'Updating…' : 'Refresh delivery status'}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={delivery.isBusy || !delivery.status?.available || !delivery.status.pending}
              onClick={() => void delivery.clear()}
            >
              Clear pending alerts
            </button>
          </div>
          <p className="policy-footnote">
            Counts cover every registered device and may overlap. Times are scheduling targets, not delivery receipts.
            Already-sending requests may finish after clearing. Provider acceptance does not guarantee device display.
          </p>
          {delivery.message && <output className="policy-saved">{delivery.message}</output>}
          {delivery.error && (
            <p
              className="form-error"
              role="alert"
            >
              {delivery.status && 'Previous counts may be out of date. '}
              {delivery.error}
            </p>
          )}
        </div>
      )}
    </details>
  );
}
