import { useState, type FormEvent } from 'react';
import { API_PATH, HTTP_METHOD } from '../../../shared/contracts';
import type { StationPolicy } from '../../../shared/policy';
import { requestApi } from '../../lib/api/requestApi';
import { PolicyLimits } from './PolicyLimits';
import { PolicySchedule } from './PolicySchedule';

/** Last observed preferences; Reset reloads these without losing drafts on every poll. */
interface SettingsFormProps {
  settings: StationPolicy;
}
/**
 * Saves a bounded draft through the authenticated API and reports validation or persistence failures.
 * @param {SettingsFormProps} props - Latest persisted preferences.
 * @param {StationPolicy} props.settings - Reset destination and initial draft.
 * @returns {JSX.Element} Mobile-compatible preferences form.
 */
export function SettingsForm({ settings }: SettingsFormProps) {
  const [draft, setDraft] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  /**
   * Submits the complete preference object without altering queue authentication.
   * @param {FormEvent<HTMLFormElement>} event - Native form submission.
   * @returns {Promise<void>} Persisted settings or a visible failure.
   */
  async function saveSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    setMessage('');
    try {
      const saved = await requestApi<StationPolicy>(API_PATH.settings, {
        method: HTTP_METHOD.post,
        body: JSON.stringify(draft),
      });
      setDraft(saved);
      setMessage('Saved on your station.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Station preferences could not be saved.');
    } finally {
      setIsSaving(false);
    }
  }
  /**
   * Keeps draft edits separate from polling updates.
   * @param {Partial<StationPolicy>} changes - Edited fields.
   */
  function changeDraft(changes: Partial<StationPolicy>): void {
    setDraft((previous) => ({ ...previous, ...changes }));
    setMessage('');
  }
  return (
    <form onSubmit={(event) => void saveSettings(event)}>
      <fieldset disabled={isSaving}>
        <legend className="visually-hidden">Station preferences</legend>
        <PolicyLimits
          draft={draft}
          onChange={changeDraft}
        />
        <p className="policy-footnote">Speed budgets are shared across configured queue slots, including idle slots.</p>
        <PolicySchedule
          draft={draft}
          onChange={changeDraft}
        />
        <div className="policy-actions">
          <button
            className="primary-button"
            type="submit"
          >
            {isSaving ? 'Saving…' : 'Save preferences'}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => setDraft(settings)}
          >
            Reset draft
          </button>
        </div>
      </fieldset>
      {message && <output className="policy-saved">{message}</output>}
      {errorMessage && (
        <p
          className="form-error"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </form>
  );
}
