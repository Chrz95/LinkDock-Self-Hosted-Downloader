import type { PolicyFieldsProps } from './PolicyLimits';

/**
 * Uses an explicit timezone so container timezone and phone travel cannot shift overnight downloads.
 * @param {PolicyFieldsProps} props - Draft and edit callback.
 * @param {StationPolicy} props.draft - Unsaved daily download window.
 * @param {PolicyFieldsProps['onChange']} props.onChange - Applies one edited field.
 * @returns {JSX.Element} Daily scheduling fields.
 */
export function PolicySchedule({ draft, onChange }: PolicyFieldsProps) {
  return (
    <div className="policy-schedule">
      <label className="policy-checkbox">
        <input
          type="checkbox"
          checked={draft.scheduleEnabled}
          onChange={(event) => onChange({ scheduleEnabled: event.target.checked })}
        />
        Only download during a daily window
      </label>
      <div className="policy-fields">
        <label>
          Start time
          <input
            type="time"
            required
            disabled={!draft.scheduleEnabled}
            value={draft.windowStart}
            onChange={(event) => onChange({ windowStart: event.target.value })}
          />
        </label>
        <label>
          End time
          <input
            type="time"
            required
            disabled={!draft.scheduleEnabled}
            value={draft.windowEnd}
            onChange={(event) => onChange({ windowEnd: event.target.value })}
          />
        </label>
        <label>
          Timezone
          <input
            type="text"
            required
            autoCapitalize="none"
            spellCheck={false}
            value={draft.timeZone}
            onChange={(event) => onChange({ timeZone: event.target.value })}
          />
        </label>
      </div>
      <p className="policy-footnote">
        Overnight windows are supported. Outside the window, progress is kept until it opens.
      </p>
    </div>
  );
}
