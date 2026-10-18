import { TOOL_COMMAND, UTILITY_ACTION, UTILITY_STATUS } from '../../../shared/utilities';
import { useUtilityUpdates } from './useUtilityUpdates';

/** Owner controls run alongside version diagnostics without exposing command arguments or private paths.
 * @returns {JSX.Element} Lazy utility-update settings and live results.
 */
export function UtilityUpdates() {
  const updates = useUtilityUpdates();
  const { snapshot: state } = updates;
  const active = state?.requested || state?.status === UTILITY_STATUS.updating;
  return (
    <details
      className="utility-updates"
      onToggle={(event) => updates.setOpen(event.currentTarget.open)}
    >
      <summary>Download utility updates</summary>
      {updates.open && (
        <div>
          <p>Update yt-dlp, gallery-dl and compatible aria2 packages while downloads are idle.</p>
          {!state && !updates.error && <output>Loading utility settings…</output>}
          {state && (
            <div>
              <label className="utility-auto">
                <input
                  type="checkbox"
                  checked={state.enabled}
                  disabled={updates.saving}
                  onChange={(event) => void updates.command(UTILITY_ACTION.settings, event.target.checked)}
                />
                Automatically check daily when idle
              </label>
              <output>{state.message}</output>
              <p>{state.usingManagedTools ? 'Verified managed tools active' : 'Using tools packaged with the image'}</p>
              {state.checkedAt && <p>Last check: {new Date(state.checkedAt).toLocaleString()}</p>}
              {state.updatedAt && <p>Last activation: {new Date(state.updatedAt).toLocaleString()}</p>}
              <ul>
                {Object.entries(state.versions).map(([id, version]) => (
                  <li key={id}>
                    {TOOL_COMMAND[id as keyof typeof TOOL_COMMAND]}: {version}
                  </li>
                ))}
              </ul>
              <div className="organization-actions">
                <button
                  type="button"
                  disabled={updates.saving || active}
                  onClick={() => void updates.command(UTILITY_ACTION.update)}
                >
                  Check &amp; update now
                </button>
                <button
                  type="button"
                  disabled={updates.saving || !active}
                  onClick={() => void updates.command(UTILITY_ACTION.cancel)}
                >
                  Cancel update
                </button>
                <button
                  type="button"
                  disabled={updates.saving || active || !state.canRollback}
                  onClick={() => void updates.command(UTILITY_ACTION.rollback)}
                >
                  Rollback previous tools
                </button>
                <button
                  type="button"
                  disabled={updates.saving || active || !state.usingManagedTools}
                  onClick={() => void updates.command(UTILITY_ACTION.restore)}
                >
                  Restore bundled tools
                </button>
              </div>
              <p>Updates wait for active transfers. Restoring tools disables automatic updates.</p>
              <p>aria2 follows the image’s signed Debian repositories. ffmpeg updates require an image rebuild.</p>
            </div>
          )}
          {updates.error && (
            <p
              role="alert"
              className="form-error"
            >
              {updates.error}
            </p>
          )}
        </div>
      )}
    </details>
  );
}
