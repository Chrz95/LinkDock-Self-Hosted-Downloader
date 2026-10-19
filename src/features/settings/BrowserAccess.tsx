import { useState } from 'react';
import { BROWSER_ACCESS, BROWSER_ACTION } from '../../../shared/browserAccess';
import { useBrowserAccess } from './useBrowserAccess';
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
      <summary>Browser verification &amp; waits</summary>
      {access.open && (
        <div className="browser-access-content">
          <p className="policy-footnote">
            Open the source in your own browser, complete its CAPTCHA and wait for its countdown. Export only that
            site’s cookies in Netscape cookies.txt format, then import here and retry the download. Use the same public
            IP as the Pi where possible. Browser-bound challenges may still fail; there is no automatic CAPTCHA solver
            or DRM unlock.
          </p>
          <fieldset disabled={access.busy}>
            <legend className="visually-hidden">Verified browser session</legend>
            <label>
              Browser User-Agent · optional
              <input
                type="text"
                value={userAgent}
                maxLength={BROWSER_ACCESS.maximumUserAgent}
                autoComplete="off"
                onChange={(event) => setUserAgent(event.target.value)}
              />
            </label>
            <label>
              Import site cookies.txt
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={(event) => {
                  const [selected] = event.target.files ?? [];
                  event.target.value = '';
                  if (selected) {
                    void access.importFile(selected, userAgent);
                  }
                }}
              />
            </label>
            <p className="policy-footnote">
              Cookies grant account access. Send them only to your trusted LinkDock station, preferably over HTTPS.
              Imports replace the previous jar, stay private on the Pi and override the mounted media-cookie file.
              Removing the import restores that mounted fallback for media. Direct files use imported cookies only.
            </p>
            {access.snapshot && (
              <output className="policy-saved">
                {access.snapshot.hasCookies
                  ? `${access.snapshot.cookieCount} cookies across ${access.snapshot.domainCount} domains`
                  : 'No imported browser session'}
              </output>
            )}
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
          </fieldset>
          <p className="policy-footnote">
            Video extraction respects supported site countdowns. Direct files honor Retry-After on HTTP 429/503, up to
            two retries of 120 seconds each. Pause/Cancel stops waits. JavaScript-only download pages need the final
            file link: open Browser assistance on a failed item in Library and paste the link after verification.
          </p>
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
