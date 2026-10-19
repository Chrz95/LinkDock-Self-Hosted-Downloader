interface DeviantartAuthorizationLinkProps {
  url: string;
}
/**
 * Exposes the complete generated request for manual opening on HTTP/mobile browsers without clipboard permissions.
 * @param {DeviantartAuthorizationLinkProps} props - Validated, current one-use authorization request.
 * @param {string} props.url - Provider URL including client, redirect, state and PKCE challenge.
 * @returns {JSX.Element} Selectable full link and provider navigation with homepage recovery guidance.
 */
export function DeviantartAuthorizationLink({ url }: DeviantartAuthorizationLinkProps) {
  return (
    <div className="source-app-fields">
      <label>
        Full authorization URL
        <input
          value={url}
          readOnly
          autoComplete="off"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
        />
      </label>
      <a
        className="primary-button"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open DeviantArt sign-in
      </a>
      <p className="policy-footnote">
        This link starts with https://www.deviantart.com/oauth2/authorize? and contains your app’s authorization
        request. Select the field to copy the entire link if the button does not work. If you reach the homepage, sign
        in there, return to LinkDock, choose Start a new sign-in and reopen the new full link. A homepage URL cannot
        finish sign-in.
      </p>
    </div>
  );
}
