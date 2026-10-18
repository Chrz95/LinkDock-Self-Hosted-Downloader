import { useNotifications } from './useNotifications';
import { AlertDelivery } from './AlertDelivery';

/**
 * Makes browser permission optional and explains setup limits without blocking normal downloads.
 * @returns {JSX.Element} Device-scoped alert controls and actionable feedback.
 */
export function NotificationControls() {
  const alerts = useNotifications();
  return (
    <section
      className="device-alerts"
      aria-labelledby="alerts-title"
    >
      <h3 id="alerts-title">A little heads-up.</h3>
      <p className="policy-footnote">
        Optional alerts for completed and failed downloads, even after the tab closes. Filenames and links stay private.
        Delivery depends on your browser and operating system.
      </p>
      {!alerts.isSupported ? (
        <p className="policy-footnote">
          Use HTTPS and a supported browser. Some devices require a Home Screen installation.
        </p>
      ) : !alerts.configuration?.enabled ? (
        <p className="policy-footnote">{alerts.configuration?.reason ?? 'Loading station alert setup…'}</p>
      ) : (
        <div className="policy-actions">
          <button
            className="primary-button"
            type="button"
            disabled={alerts.isBusy}
            onClick={() => void (alerts.isSubscribed ? alerts.disable() : alerts.enable())}
          >
            {alerts.isSubscribed ? 'Disable alerts on this device' : 'Enable alerts on this device'}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={alerts.isBusy || !alerts.isSubscribed}
            onClick={() => void alerts.test()}
          >
            Send a test alert
          </button>
        </div>
      )}
      {alerts.message && <output className="policy-saved">{alerts.message}</output>}
      {alerts.errorMessage && (
        <p
          className="form-error"
          role="alert"
        >
          {alerts.errorMessage}
        </p>
      )}
      {alerts.configuration?.enabled && <AlertDelivery />}
    </section>
  );
}
