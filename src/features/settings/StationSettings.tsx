import type { PolicySnapshot } from '../../../shared/policy';
import { Icon } from '../../components/ui/Icon';
import { SettingsForm } from './SettingsForm';

/** Optional policy state permits older snapshots during rolling upgrades. */
interface StationSettingsProps {
  policy: PolicySnapshot | undefined;
}
/**
 * Makes station-wide controls discoverable without crowding the primary link composer.
 * @param {StationSettingsProps} props - Current policy snapshot.
 * @param {PolicySnapshot | undefined} props.policy - Owner preferences and scheduler decision.
 * @returns {JSX.Element | null} Expandable controls when supported by the station.
 */
export function StationSettings({ policy }: StationSettingsProps) {
  if (!policy) {
    return null;
  }
  return (
    <details className="station-settings">
      <summary>
        <Icon name="clock" />
        <span>
          Download defaults<small>{policy.holdReason ?? 'Completed folder, bandwidth & download window'}</small>
        </span>
        <Icon name="plus" />
      </summary>
      <p className="policy-footnote">
        Changing bandwidth, free space or the download window reconnects active downloads. Some sources may start over.
      </p>
      <SettingsForm settings={policy.settings} />
      <p className="policy-footnote">Changes apply to all downloads and devices. Manually paused jobs stay paused.</p>
      {policy.holdReason && <output className="policy-hold">{policy.holdReason}</output>}
    </details>
  );
}
