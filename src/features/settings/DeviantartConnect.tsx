import { useDeviantartOAuth } from './useDeviantartOAuth';
import { DeviantartOAuthSetup } from './DeviantartOAuthSetup';
import { DeviantartOAuthReturn } from './DeviantartOAuthReturn';
import type { DeviantartSnapshot } from '../../../shared/deviantart';
import { DeviantartConnectionStatus } from './DeviantartConnectionStatus';
interface DeviantartConnectProps {
  onConnected: () => Promise<void>;
  account: DeviantartSnapshot | null;
  accountError: string;
}
/**
 * Connects HTTP stations through a copy return and HTTPS stations through an automatic callback.
 * @param {DeviantartConnectProps} props - Non-secret source metadata refresh.
 * @param {() => Promise<void>} props.onConnected - Reloads account flags after a copied-response exchange.
 * @param {DeviantartSnapshot | null} props.account - Durable, non-secret account flags loaded from the station.
 * @param {string} props.accountError - Failed metadata read, distinct from a missing account.
 * @returns {JSX.Element} Mobile-friendly provider sign-in and private app setup.
 */
export function DeviantartConnect({ onConnected, account, accountError }: DeviantartConnectProps) {
  const access = useDeviantartOAuth();
  return (
    <section className="source-connect">
      <h3>DeviantArt account connection</h3>
      <DeviantartConnectionStatus
        snapshot={account}
        error={accountError}
      />
      <p>
        Sign in on DeviantArt. HTTP stations finish with one return-URL paste; LinkDock retrieves and manages the token.
      </p>
      <a
        href="https://www.deviantart.com/users/login"
        target="_blank"
        rel="noopener noreferrer"
      >
        Sign in to DeviantArt first
      </a>
      <p className="policy-footnote">After signing in, return here and continue with a fresh authorization link.</p>
      <fieldset disabled={access.busy}>
        {!access.authorizationUrl && (
          <button
            type="button"
            className="primary-button"
            disabled={!access.snapshot?.configured}
            onClick={() => void access.command('start')}
          >
            {access.busy ? 'Connecting…' : account?.hasAccount ? 'Reconnect DeviantArt' : 'Continue to DeviantArt'}
          </button>
        )}
        {(access.snapshot?.returnMode === 'copy' || access.authorizationUrl) && (
          <DeviantartOAuthReturn
            access={access}
            onConnected={onConnected}
          />
        )}
        {access.snapshot?.returnMode === 'direct' && (
          <p className="policy-footnote">
            This station uses an automatic HTTPS return, so no Authorization response URL field is needed. If you access
            LinkDock using HTTP only, remove an HTTPS PUBLIC_ORIGIN override from your container settings, recreate the
            container and reload this page to enable the paste step.
          </p>
        )}
        <DeviantartOAuthSetup access={access} />
      </fieldset>
      {access.message && <output className="policy-saved">{access.message}</output>}
      {access.error && (
        <p
          role="alert"
          className="form-error"
        >
          {access.error}
        </p>
      )}
    </section>
  );
}
