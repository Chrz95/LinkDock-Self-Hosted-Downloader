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
          ? 'Saved credentials survive page reloads. Blank secret fields are intentional.'
          : 'Finish the authorization steps below to save your account.'}
      </p>
      <details>
        <summary>Account saved, but downloads fail?</summary>
        <p className="policy-footnote">
          OAuth and browser cookies provide different kinds of access. Check the error on the failed Library item. For
          browser verification, send a session with the companion. For a rejected OAuth grant, reconnect here. Parser,
          network and permission errors need different fixes; reconnecting is not a universal solution.
        </p>
      </details>
    </div>
  );
}
