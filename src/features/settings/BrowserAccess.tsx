import { useState } from 'react';
import { BROWSER_ACTION } from '../../../shared/browserAccess';
import { useBrowserAccess } from './useBrowserAccess';
import { BrowserSessions } from './BrowserSessions';
import { BrowserManualImport } from './BrowserManualImport';
import { BrowserPacing } from './BrowserPacing';

/** User-assisted verification, exported sessions and respectful extractor pacing in one private settings panel.
 * @returns {JSX.Element} Cookie import/removal and wait guidance; no automatic CAPTCHA solving.
 */
export function BrowserAccess() {
  const access = useBrowserAccess();
  const [userAgent, setUserAgent] = useState('');
  return (
    <details
      className="station-settings browser-access"
      onToggle={(event) => access.setOpen(event.currentTarget.open)}
    >
      <summary>Browser sessions</summary>
      {access.open && (
        <div className="browser-access-content">
          <p className="policy-footnote">
            Use the companion to connect Instagram or DeviantArt. Each site keeps its own browser session.
          </p>
          <fieldset disabled={access.busy}>
            <legend className="visually-hidden">Verified browser session</legend>
            <BrowserSessions access={access} />
            {access.snapshot && (
              <output className="policy-saved">
                {access.snapshot.hasCookies
                  ? `${access.snapshot.cookieCount} cookies across ${access.snapshot.domainCount} domains`
                  : 'No imported browser session'}
              </output>
            )}
            <details>
              <summary>Manual import &amp; advanced options</summary>
              <BrowserManualImport
                access={access}
                userAgent={userAgent}
                setUserAgent={setUserAgent}
              />
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setUserAgent('');
                  void access.command(BROWSER_ACTION.clear, {});
                }}
              >
                Remove imported session
              </button>
              <BrowserPacing access={access} />
            </details>
          </fieldset>
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
