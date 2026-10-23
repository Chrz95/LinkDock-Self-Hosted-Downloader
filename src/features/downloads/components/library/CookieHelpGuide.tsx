import type { DownloadJob } from '../../../../../shared/contracts';

/** Explains the shipped companion's supported sites without promising an automatic browser install.
 * @param {object} props - Failed source needing an account session.
 * @returns {JSX.Element} Installation and direct session-transfer instructions.
 */
export function CookieHelpGuide({ job }: { job: DownloadJob }) {
  const host = new URL(job.url).hostname;
  const supported = ['instagram.com', 'deviantart.com'].some((site) => host === site || host.endsWith(`.${site}`));
  return (
    <div className="cookie-help-guide">
      <p>
        This source reported an account-session problem. Cookies may be missing or expired; the error does not prove the
        exact cause. Sign in to the source and check that you can open this item.
      </p>
      {supported ? (
        <ol>
          <li>
            <strong>Install once.</strong> Download and unzip the companion. In desktop Chrome, Edge or Brave, open
            Extensions, enable Developer mode, choose <strong>Load unpacked</strong> and select the unzipped folder. Pin
            the companion to your toolbar. Browser approval is required; LinkDock cannot install it silently.
          </li>
          <li>
            <strong>Sign in to the source.</strong> Open the original link in the same browser profile and complete any
            login or verification. If the companion is already installed, start here.
          </li>
          <li>
            <strong>Send your session.</strong> Return to your signed-in LinkDock tab. Click the companion icon, choose
            Instagram or DeviantArt, verify the station address, check the trust box and click
            <strong> Send session to LinkDock</strong>. Allow access to the selected site.
          </li>
          <li>
            <strong>Retry the download.</strong> Once the companion confirms the session was saved, open Download
            library and choose <strong>Restart</strong> on this item. Other sites’ saved sessions are preserved.
          </li>
        </ol>
      ) : (
        <p>
          The companion currently supports Instagram and DeviantArt only. For this source, export its logged-in cookies
          in Netscape cookies.txt format and import them under Settings → Browser sessions, then restart the download
          from Library.
        </p>
      )}
      {supported && (
        <a
          className="primary-button"
          href="/linkdock-browser-connector.zip"
          download
        >
          Download browser companion
        </a>
      )}
      <p className="policy-footnote">
        Mobile browsers without extension support can use sessions sent from a desktop browser. Send cookies only to
        your trusted station, preferably over HTTPS. Browser-bound checks may still fail on the Pi. DeviantArt OAuth is
        separate; these steps do not remove your saved account connection.
      </p>
    </div>
  );
}
