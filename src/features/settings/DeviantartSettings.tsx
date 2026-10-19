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
      <summary>DeviantArt collections & account</summary>
      {access.open && (
        <div className="browser-access-body">
          <p>
            Collect an artist’s accessible artwork, videos and writing. Save profile defaults once, or paste a specific
            gallery, folder or post link in Overview.
          </p>
          <fieldset disabled={access.busy}>
            <DeviantartConnect />
            <DeviantartPreferences access={access} />
            <DeviantartAccount access={access} />
          </fieldset>
          <p className="policy-footnote">
            DeviantArt transfers run one at a time to protect token refreshes. Pause them before changing the account.
            Removing credentials keeps collection preferences. Account access covers content your grant can access.
          </p>
          <a
            href="https://gdl-org.github.io/docs/configuration.html#extractor-deviantart-refresh-token"
            target="_blank"
            rel="noopener noreferrer"
          >
            Account authorization guide
          </a>
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
