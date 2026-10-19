import type { DeviantartSnapshot } from '../../../shared/deviantart';
interface DeviantartConnectionStatusProps {
  snapshot: DeviantartSnapshot | null;
  error: string;
}
/**
 * Distinguishes durable account storage from a pending sign-in and a separate browser verification challenge.
 * @param {DeviantartConnectionStatusProps} props - Server-loaded, non-secret account metadata.
 * @param {DeviantartSnapshot | null} props.snapshot - Current saved account flags, never token material.
 * @param {string} props.error - Metadata failure indicator; private diagnostics are not displayed here.
 * @returns {JSX.Element} Persistent account status and browser-verification recovery guidance.
 */
export function DeviantartConnectionStatus({ snapshot, error }: DeviantartConnectionStatusProps) {
  return (
    <div className="source-app-fields">
      <output className="policy-saved">
        {error
          ? 'Account status could not be confirmed. Reopen these settings to retry.'
          : snapshot
            ? snapshot.hasAccount
              ? 'DeviantArt account saved on this station'
              : 'No DeviantArt account saved on this station'
            : 'Checking saved DeviantArt account…'}
      </output>
      <p className="policy-footnote">
        {snapshot?.hasAccount
          ? 'Saved credentials survive page reloads. Blank secret fields are intentional. '
          : 'On HTTP, approve access and finish the response-URL step here to save the account. '}
        An unfinished sign-in must be restarted after reloading. Saved credentials do not prove current site access.
      </p>
      <p className="policy-footnote">
        Browser verification is separate from OAuth sign-in. If a download is blocked, open its source in your browser,
        complete any verification and import that site’s Netscape cookies.txt under Browser verification &amp; waits in
        Settings, then restart the download. Use the Pi’s public network where possible. Cookies may not resolve
        browser-bound or network blocks; this error alone does not mean your saved account was removed.
      </p>
    </div>
  );
}
