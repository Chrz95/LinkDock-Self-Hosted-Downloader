import { useEffect, useRef } from 'react';
import { DEVIANTART } from '../../../shared/deviantart';
import { DEVIANTART_OAUTH } from '../../../shared/deviantartOAuth';
import { useDeviantartOAuth } from './useDeviantartOAuth';
/**
 * Connects through a provider-owned login with a one-time, self-hosted OAuth app setup.
 * @returns {JSX.Element} Mobile-friendly sign-in and private application setup controls.
 */
export function DeviantartConnect() {
  const access = useDeviantartOAuth();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => () => form.current?.reset(), []);
  const callbackUrl = access.snapshot?.callbackUrl ?? new URL(DEVIANTART_OAUTH.callback, window.location.origin).href;
  return (
    <section className="source-connect">
      <h3>Connect your DeviantArt account</h3>
      <p>Sign in on DeviantArt. LinkDock retrieves, stores and refreshes your account token automatically.</p>
      <fieldset disabled={access.busy}>
        <button
          type="button"
          className="primary-button"
          disabled={!access.snapshot?.configured}
          onClick={() => void access.command('start')}
        >
          {access.busy ? 'Connecting…' : 'Continue to DeviantArt'}
        </button>
        <details className="source-app-setup">
          <summary>One-time app setup {access.snapshot?.configured ? '· saved' : '· required'}</summary>
          <p>
            Register a confidential application in{' '}
            <a
              href="https://www.deviantart.com/developers/apps"
              target="_blank"
              rel="noopener noreferrer"
            >
              DeviantArt Applications &amp; Keys
            </a>
            . Add this exact callback URL to its OAuth redirect whitelist. Then save its ID and secret below.
          </p>
          <label>
            OAuth callback URL
            <input
              value={callbackUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <form
            ref={form}
            autoComplete="off"
            className="source-app-fields"
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              event.currentTarget.reset();
              void access.command('setup', {
                clientId: fields.get('clientId'),
                clientSecret: fields.get('clientSecret'),
              });
            }}
          >
            <label>
              App client ID
              <input
                name="clientId"
                inputMode="numeric"
                maxLength={DEVIANTART.maximumClientCharacters}
                required
              />
            </label>
            <label>
              App client secret
              <input
                name="clientSecret"
                type="password"
                autoComplete="new-password"
                maxLength={DEVIANTART.maximumClientCharacters}
                required
              />
            </label>
            <button type="submit">Save sign-in setup</button>
          </form>
          <p className="policy-footnote">
            Use the same station address throughout sign-in. Behind a reverse proxy, set PUBLIC_ORIGIN to that address.
          </p>
        </details>
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
