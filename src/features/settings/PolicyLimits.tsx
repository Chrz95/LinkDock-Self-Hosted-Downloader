import { POLICY_LIMIT, type StationPolicy } from '../../../shared/policy';

/** Controlled resource inputs shared by the preferences form. */
export interface PolicyFieldsProps {
  draft: StationPolicy;
  onChange: (changes: Partial<StationPolicy>) => void;
}
/**
 * Labels speed units and the free-space buffer explicitly for predictable Pi operation.
 * @param {PolicyFieldsProps} props - Draft and edit callback.
 * @param {StationPolicy} props.draft - Unsaved preferences.
 * @param {PolicyFieldsProps['onChange']} props.onChange - Applies one edited field.
 * @returns {JSX.Element} Resource limits.
 */
export function PolicyLimits({ draft, onChange }: PolicyFieldsProps) {
  return (
    <div className="policy-fields">
      <label>
        Download limit · KiB/s
        <input
          type="number"
          min={0}
          max={POLICY_LIMIT.maximumRateKib}
          step={1}
          required
          value={Number.isFinite(draft.downloadKibPerSecond) ? draft.downloadKibPerSecond : ''}
          onChange={(event) => onChange({ downloadKibPerSecond: event.target.valueAsNumber })}
        />
        <small>0 means unlimited</small>
      </label>
      <label>
        Torrent upload · KiB/s
        <input
          type="number"
          min={0}
          max={POLICY_LIMIT.maximumRateKib}
          step={1}
          required
          value={Number.isFinite(draft.uploadKibPerSecond) ? draft.uploadKibPerSecond : ''}
          onChange={(event) => onChange({ uploadKibPerSecond: event.target.valueAsNumber })}
        />
        <small>0 means unlimited</small>
      </label>
      <label>
        Keep free · GiB
        <input
          type="number"
          min={0}
          max={POLICY_LIMIT.maximumReserveGib}
          step={1}
          required
          value={Number.isFinite(draft.reserveGib) ? draft.reserveGib : ''}
          onChange={(event) => onChange({ reserveGib: event.target.valueAsNumber })}
        />
        <small>Downloads wait below this buffer</small>
      </label>
    </div>
  );
}
