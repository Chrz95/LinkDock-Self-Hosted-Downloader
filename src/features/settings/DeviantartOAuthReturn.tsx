import { Fragment, useEffect, useRef } from 'react';
import { DEVIANTART_OAUTH } from '../../../shared/deviantartOAuth';
import type { useDeviantartOAuth } from './useDeviantartOAuth';
import { DeviantartAuthorizationLink } from './DeviantartAuthorizationLink';
interface DeviantartOAuthReturnProps {
  access: ReturnType<typeof useDeviantartOAuth>;
  onConnected: () => Promise<void>;
}
/**
 * Completes an HTTP-only station's grant without putting response codes in React state or browser storage.
 * @param {DeviantartOAuthReturnProps} props - Pending connection and metadata refresh.
 * @param {ReturnType<typeof useDeviantartOAuth>} props.access - Public authorization link and private POST action.
 * @param {() => Promise<void>} props.onConnected - Reloads non-secret account metadata after successful exchange.
 * @returns {JSX.Element} User-activated provider link and immediately cleared return form.
 */
export function DeviantartOAuthReturn({ access, onConnected }: DeviantartOAuthReturnProps) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => () => form.current?.reset(), [access.authorizationUrl]);
  const pending = Boolean(access.authorizationUrl);
  return (
    <form
      ref={form}
      className="source-app-fields source-oauth-return"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending || access.busy) {
          return;
        }
        const fields = new FormData(event.currentTarget);
        event.currentTarget.reset();
        void access.command('complete', { responseUrl: fields.get('responseUrl') }).then((connected) => {
          if (connected) {
            void onConnected();
          }
        });
      }}
    >
      <h4>Finish connecting · HTTP station</h4>
      {pending ? (
        <Fragment>
          <DeviantartAuthorizationLink url={access.authorizationUrl} />
          <p>
            Approve access in the new tab. The redirect may show a connection error at localhost:6414; this is expected.
            Copy that tab’s complete address, return here and paste it below. Keep this LinkDock tab open.
          </p>
        </Fragment>
      ) : (
        <p>
          {access.snapshot?.configured
            ? 'Choose Continue to DeviantArt or Reconnect DeviantArt above to enable this field.'
            : 'Save your client ID and secret in One-time app setup, then choose Continue to DeviantArt above.'}{' '}
          After approving access, copy the complete response address from that tab into this field.
        </p>
      )}
      <label>
        Authorization response URL
        <input
          name="responseUrl"
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          maxLength={DEVIANTART_OAUTH.maximumReturnCharacters}
          disabled={!pending}
          placeholder="Paste the complete address containing code and state after approval"
          required
        />
      </label>
      <button
        type="submit"
        disabled={!pending}
      >
        Finish connection
      </button>
      {pending && (
        <button
          type="button"
          className="text-button"
          onClick={() => void access.command('start')}
        >
          Start a new sign-in
        </button>
      )}
      <p className="policy-footnote">
        This copies a one-use authorization response. LinkDock retrieves and saves the refresh token on the station.
        Finish within ten minutes. A reload or station restart requires a new sign-in.
      </p>
    </form>
  );
}
