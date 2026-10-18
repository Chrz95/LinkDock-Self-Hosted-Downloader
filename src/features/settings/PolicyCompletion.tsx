import { JOB_OPTIONS } from '../../../shared/jobOptions';
import type { PolicyFieldsProps } from './PolicyLimits';

/**
 * Selects one persisted destination for every newly added download, without rewriting older jobs.
 * @param {PolicyFieldsProps} props - Draft preferences and edit callback.
 * @param {StationPolicy} props.draft - Unsaved station preferences.
 * @param {PolicyFieldsProps['onChange']} props.onChange - Applies a default destination change.
 * @returns {JSX.Element} Automatic completion toggle and relative folder editor.
 */
export function PolicyCompletion({ draft, onChange }: PolicyFieldsProps) {
  const enabled = draft.completionDirectory !== null && draft.completionDirectory !== undefined;
  return (
    <section className="policy-completion">
      <h3>Completed downloads</h3>
      <label className="policy-checkbox">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) =>
            onChange({ completionDirectory: event.target.checked ? JOB_OPTIONS.rootDirectory : null })
          }
        />
        Automatically move completed downloads
      </label>
      {enabled && (
        <div className="policy-fields">
          <label>
            Default completed folder
            <input
              type="text"
              required
              maxLength={JOB_OPTIONS.maximumDirectoryCharacters}
              value={draft.completionDirectory ?? JOB_OPTIONS.rootDirectory}
              placeholder=". or Movies"
              autoComplete="off"
              onChange={(event) => onChange({ completionDirectory: event.target.value })}
            />
          </label>
        </div>
      )}
      <p className="policy-footnote">
        Use . for your mounted completed folder, or a subfolder such as Movies. Each download gets its own job folder.
        Save once for all devices and future downloads, including torrents. Existing jobs keep their destination. A
        download’s Move on completion control can override this default.
      </p>
    </section>
  );
}
