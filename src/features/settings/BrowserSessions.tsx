import { BROWSER_ACTION } from '../../../shared/browserAccess';
import type { useBrowserAccess } from './useBrowserAccess';

/** Shows non-secret session scopes and a direct browser handoff guide.
 * @param {object} props - Session metadata and owner commands.
 * @returns {JSX.Element} Independent session removal and companion setup.
 */
export function BrowserSessions({ access }: { access: ReturnType<typeof useBrowserAccess> }) {
  return (
    <div className="browser-sessions">
      <details>
        <summary>Connect directly from your browser</summary>
        <p className="policy-footnote">
          Install the companion once in desktop Chrome, Edge or Brave: unzip the companion, open your browser’s
          Extensions page, enable Developer mode and choose Load unpacked. Select the unzipped folder.
        </p>
        <a
          href="/linkdock-browser-connector.zip"
          download
        >
          Download browser companion
        </a>
        <p className="policy-footnote">
          Open your trusted LinkDock tab, sign in and use Connect station in the companion once. You can then add a
          download from any tab. For Instagram or DeviantArt sessions, sign in to that source and expand Connect a site
          session in the companion. Choose the source, check the station address and send the session. No cookie file or
          access-token entry is needed. Reopen this panel to refresh the list. Mobile browsers without extension support
          can use sessions sent from a desktop browser.
        </p>
      </details>
      {access.snapshot?.sessions?.map((session) => (
        <div
          key={session.domain}
          className="policy-saved"
        >
          <span>
            {session.domain} · {session.cookieCount} cookies
          </span>
          <button
            type="button"
            className="text-button"
            disabled={access.busy}
            onClick={() => void access.command(BROWSER_ACTION.remove, { domain: session.domain })}
          >
            Remove {session.domain}
          </button>
        </div>
      ))}
    </div>
  );
}
