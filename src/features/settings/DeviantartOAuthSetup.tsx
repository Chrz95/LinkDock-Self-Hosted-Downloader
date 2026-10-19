import { useEffect, useRef } from 'react';
import { DEVIANTART } from '../../../shared/deviantart';
import type { useDeviantartOAuth } from './useDeviantartOAuth';
interface DeviantartOAuthSetupProps {
  access: ReturnType<typeof useDeviantartOAuth>;
}
/**
 * Shows the exact HTTPS redirect to register, including the upstream landing page for HTTP stations.
 * @param {DeviantartOAuthSetupProps} props - Connection setup owner.
 * @param {ReturnType<typeof useDeviantartOAuth>} props.access - Public setup metadata and write-only commands.
 * @returns {JSX.Element} Private confidential-app setup form.
 */
export function DeviantartOAuthSetup({ access }: DeviantartOAuthSetupProps) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => () => form.current?.reset(), []);
  const callbackUrl = access.snapshot?.callbackUrl ?? '';
  return (
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
        . Edit that application and find its <strong>OAuth2 Redirect URI Whitelist</strong> field. Add the exact
        callback shown below, including https:// and the full path.
      </p>
      <label>
        OAuth callback URL
        <input
          value={callbackUrl}
          readOnly
          disabled={!access.snapshot}
          placeholder="Load or save app setup to see the callback"
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <p>
        The <strong>Website URL</strong> field is separate: putting the callback there does not authorize the redirect.
        Save the redirect whitelist on DeviantArt, then save the same application’s client ID and secret below.
      </p>
      <p className="policy-footnote">
        If sign-in opens the DeviantArt homepage without completing authorization, check this whitelist first. After
        correcting it, return to LinkDock and start a new sign-in.
      </p>
      <form
        ref={form}
        autoComplete="off"
        className="source-app-fields"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          event.currentTarget.reset();
          void access.command('setup', { clientId: fields.get('clientId'), clientSecret: fields.get('clientSecret') });
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
        HTTP stations use gallery-dl’s HTTPS landing page and one return-URL paste. HTTPS stations return automatically.
        When upgrading an HTTP station, update the app’s redirect whitelist to the URL shown here.
      </p>
    </details>
  );
}
