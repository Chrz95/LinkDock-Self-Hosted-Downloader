import { useDeviantart } from './useDeviantart';
import { DeviantartAccount } from './DeviantartAccount';
import { DeviantartPreferences } from './DeviantartPreferences';
import { DeviantartConnect } from './DeviantartConnect';
/** Source-specific collection defaults and write-only account setup in the dedicated settings destination.
 * @returns {JSX.Element} Responsive, lazy-loaded source controls.
 */
export function DeviantartSettings() {
  const access = useDeviantart();
  return (
    <details
      className="station-settings deviantart-settings"
      open={access.open}
      onToggle={(event) => access.setOpen(event.currentTarget.open)}
    >
      <summary>DeviantArt account</summary>
      {access.open && (
        <div className="browser-access-body">
          <p>
            Connect your DeviantArt account here. Browser cookies are managed separately under Browser verification
            &amp; waits.
          </p>
          <fieldset disabled={access.busy}>
            <DeviantartConnect
              onConnected={access.refresh}
              account={access.snapshot}
              accountError={access.error}
            />
            <details>
              <summary>What to download</summary>
              <DeviantartPreferences access={access} />
            </details>
            <details>
              <summary>Advanced account options</summary>
              <DeviantartAccount access={access} />
            </details>
          </fieldset>
          <p className="policy-footnote">Saved accounts persist after reload. Reconnect only if access is rejected.</p>
          {access.message && <output className="policy-saved">{access.message}</output>}
          {access.error && (
            <p
              className="form-error"
              role="alert"
            >
              {access.error}
            </p>
          )}
        </div>
      )}
    </details>
  );
}
