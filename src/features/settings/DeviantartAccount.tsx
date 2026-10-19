import { useEffect, useRef } from 'react';
import { DEVIANTART, DEVIANTART_ACTION } from '../../../shared/deviantart';
import type { useDeviantart } from './useDeviantart';
interface DeviantartAccountProps {
  access: ReturnType<typeof useDeviantart>;
}
/**
 * Accepts a fresh OAuth grant without retaining tokens in component state or browser storage.
 * @param {DeviantartAccountProps} props - Source setup controls.
 * @param {ReturnType<typeof useDeviantart>} props.access - Non-secret setup metadata and write-only action.
 * @returns {JSX.Element} Private account import and removal form.
 */
export function DeviantartAccount({ access }: DeviantartAccountProps) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => () => form.current?.reset(), []);
  return (
    <form
      ref={form}
      className="source-account"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        event.currentTarget.reset();
        void access.command(DEVIANTART_ACTION.account, {
          refreshToken: fields.get('refreshToken'),
          clientId: fields.get('clientId'),
          clientSecret: fields.get('clientSecret'),
        });
      }}
    >
      <h3>Account access · optional</h3>
      <p
        className="policy-saved"
        aria-live="polite"
      >
        {access.snapshot
          ? access.snapshot.hasAccount
            ? 'Account credentials saved'
            : 'Using public access'
          : 'Account status unavailable'}
        {access.snapshot?.customClient ? ' · custom OAuth app' : ''}
      </p>
      <label>
        DeviantArt refresh token
        <input
          name="refreshToken"
          type="password"
          autoComplete="new-password"
          maxLength={DEVIANTART.maximumTokenCharacters}
          required
        />
      </label>
      <label>
        OAuth client ID · optional
        <input
          name="clientId"
          type="text"
          inputMode="numeric"
          maxLength={DEVIANTART.maximumClientCharacters}
        />
      </label>
      <label>
        OAuth client secret · optional
        <input
          name="clientSecret"
          type="password"
          autoComplete="new-password"
          maxLength={DEVIANTART.maximumClientCharacters}
        />
      </label>
      <p className="policy-footnote">
        Use a fresh token from gallery-dl account authorization. For a custom OAuth app, supply both matching app
        fields. Save it to your trusted station over HTTPS. Tokens rotate: keep the private Pi credentials directory and
        avoid using the same grant elsewhere. Saving stores credentials; the next download checks whether they work.
      </p>
      <button
        type="submit"
        className="primary-button"
      >
        Save account credentials
      </button>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          form.current?.reset();
          void access.command(DEVIANTART_ACTION.clear, {});
        }}
      >
        Remove DeviantArt account
      </button>
    </form>
  );
}
