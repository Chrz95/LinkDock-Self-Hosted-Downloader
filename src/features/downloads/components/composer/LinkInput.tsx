import { Icon } from '../../../../components/ui/Icon';
import { MAXIMUM_BATCH_LINKS } from '../../../../../shared/batch';

/** Controlled link draft and submission state. */
interface LinkInputProps {
  draft: string;
  isDisabled: boolean;
  buttonLabel: string;
  canSubmit: boolean;
  onChange: (draft: string) => void;
}
/**
 * Supports one link or a multiline batch while preserving a URL-friendly mobile keyboard.
 * @param {LinkInputProps} props - Draft controls.
 * @param {string} props.draft - Owner-reviewed link text.
 * @param {boolean} props.isDisabled - Submission in progress.
 * @param {string} props.buttonLabel - Current review or acceptance action.
 * @param {boolean} props.canSubmit - Whether the reviewed batch contains new work.
 * @param {(draft: string) => void} props.onChange - Edits the draft and invalidates prior review.
 * @returns {JSX.Element} Accessible multiline link input and primary action.
 */
export function LinkInput({ draft, isDisabled, buttonLabel, canSubmit, onChange }: LinkInputProps) {
  const minimumRows = 2;
  return (
    <div className="url-field">
      <Icon name="link" />
      <label
        className="visually-hidden"
        htmlFor="download-url"
      >
        File URL
      </label>
      <textarea
        id="download-url"
        name="url"
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={`Paste links, one per line · up to ${MAXIMUM_BATCH_LINKS}`}
        autoComplete="off"
        required
        rows={minimumRows}
        value={draft}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby="download-help"
      />
      <button
        className="primary-button"
        type="submit"
        disabled={isDisabled || !canSubmit}
      >
        <Icon name="download" />
        {buttonLabel}
      </button>
    </div>
  );
}
