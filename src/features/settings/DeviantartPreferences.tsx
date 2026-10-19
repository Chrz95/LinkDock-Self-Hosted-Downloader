import { DEVIANTART_ACTION, DEVIANTART_SECTIONS, STORY_FORMAT } from '../../../shared/deviantart';
import type { useDeviantart } from './useDeviantart';
interface DeviantartPreferencesProps {
  access: ReturnType<typeof useDeviantart>;
}
/**
 * Saves station-wide source defaults independently of private account setup.
 * @param {DeviantartPreferencesProps} props - Source controls.
 * @param {ReturnType<typeof useDeviantart>} props.access - Metadata and serialized owner action.
 * @returns {JSX.Element | null} Source preference form after metadata loads.
 */
export function DeviantartPreferences({ access }: DeviantartPreferencesProps) {
  const { snapshot } = access;
  if (!snapshot) {
    return null;
  }
  return (
    <form
      key={JSON.stringify([snapshot.include, snapshot.original, snapshot.stories])}
      className="source-preferences"
      onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        void access.command(DEVIANTART_ACTION.preferences, {
          include: fields.getAll('include'),
          original: fields.has('original'),
          stories: fields.get('stories'),
        });
      }}
    >
      <fieldset>
        <legend>Include when downloading an artist profile</legend>
        {DEVIANTART_SECTIONS.map((section) => (
          <label
            className="source-choice"
            key={section.value}
          >
            <input
              type="checkbox"
              name="include"
              value={section.value}
              defaultChecked={snapshot.include.includes(section.value)}
            />
            {section.label}
          </label>
        ))}
      </fieldset>
      <label className="source-choice">
        <input
          type="checkbox"
          name="original"
          defaultChecked={snapshot.original}
        />
        Prefer original files when available
      </label>
      <label>
        Story & journal format
        <select
          name="stories"
          defaultValue={snapshot.stories}
        >
          <option value={STORY_FORMAT.text}>Plain text · TXT</option>
          <option value={STORY_FORMAT.html}>Formatted document · HTML</option>
          <option value={STORY_FORMAT.none}>Skip textual content</option>
        </select>
      </label>
      <p className="policy-footnote">
        Profile choices apply to artist-profile links. A specific gallery, folder or post link keeps its own scope.
        Story format also applies to literature and status posts. HTML documents download as attachments.
      </p>
      <button
        type="submit"
        className="primary-button"
      >
        Save collection preferences
      </button>
    </form>
  );
}
