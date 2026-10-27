import { useCompanions } from './useCompanions';

/** Owner-visible revocation for download-only extension credentials, separate from provider login sessions.
 * @returns {JSX.Element} Lazy registration list without any cleartext tokens or hashes.
 */
export function CompanionConnections() {
  const companions = useCompanions();
  return (
    <details
      className="station-settings"
      onToggle={(event) => companions.setOpen(event.currentTarget.open)}
    >
      <summary>Browser companions</summary>
      {companions.open && (
        <div className="browser-access-content">
          <p className="policy-footnote">
            Pair Browser Companion 1.2 from your signed-in station tab. It can then add downloads with the tab closed.
            Connections can only add downloads; they cannot read your library or manage accounts.
          </p>
          <a
            href="/linkdock-browser-connector.zip"
            download
          >
            Download browser companion
          </a>
          <p className="policy-footnote">
            Connections expire after 90 days. Revoke access here if a browser is lost or no longer used. Changing the
            station password also invalidates all connections. Use HTTPS to protect pairing and download access.
          </p>
          <fieldset disabled={companions.busy}>
            <legend className="visually-hidden">Connected browser companions</legend>
            <button
              type="button"
              className="text-button"
              onClick={() => void companions.refresh()}
            >
              Refresh companions
            </button>
            {companions.connections?.length === 0 && <p>No active companion connections.</p>}
            {companions.connections?.map((connection) => (
              <div
                className="policy-saved"
                key={connection.id}
              >
                <span>
                  Paired {new Date(connection.createdAt).toLocaleString()} · expires{' '}
                  {new Date(connection.expiresAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void companions.revoke(connection.id)}
                >
                  Revoke companion
                </button>
              </div>
            ))}
          </fieldset>
          {companions.error && (
            <p
              className="form-error"
              role="alert"
            >
              {companions.error}
            </p>
          )}
          <small>Site-session sharing still requires an open, signed-in station tab and explicit confirmation.</small>
        </div>
      )}
    </details>
  );
}
