import { useState, type SubmitEvent } from 'react';
import { ThemeToggle } from '../theme/ThemeToggle';
import { Icon } from '../../components/ui/Icon';

/** Authentication form contract; the password is never written to browser storage. */
interface UnlockStationProps {
  onUnlock: (token: string) => Promise<void>;
}
/**
 * Renders the station password gate and exposes failed attempts inline.
 * @param {UnlockStationProps} props - Authentication behavior.
 * @param {(token: string) => Promise<void>} props.onUnlock - Establishes an HttpOnly session.
 * @returns {JSX.Element} Accessible password form.
 */
export function UnlockStation({ onUnlock }: UnlockStationProps) {
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * Submits the credential and removes it from the field after acceptance.
   * @param {SubmitEvent<HTMLFormElement>} event - Native form submission.
   * @returns {Promise<void>} Authentication completion.
   */
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const token = String(new FormData(form).get('token') ?? '');
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await onUnlock(token);
      form.reset();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to unlock the station.');
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <main className="unlock-shell">
      <div className="unlock-appearance">
        <ThemeToggle />
      </div>
      <form
        className="unlock-card"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <span className="brand-symbol">
          <Icon name="download" />
        </span>
        <p className="eyebrow">WELCOME TO LINKDOCK</p>
        <h1>
          Your files.
          <br />
          Home, at last.
        </h1>
        <p className="muted">Unlock your download station. Transfers keep running when you close your browser.</p>
        <label htmlFor="station-password">Station password</label>
        <input
          id="station-password"
          name="token"
          type="password"
          autoComplete="current-password"
          required
        />
        {errorMessage && <p role="alert">{errorMessage}</p>}
        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Unlocking…' : 'Unlock station'}
          <Icon name="arrow" />
        </button>
        <small>Use the LINKDOCK_ACCESS_TOKEN configured on your Pi.</small>
      </form>
    </main>
  );
}
