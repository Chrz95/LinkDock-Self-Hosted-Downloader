import type { PolicySnapshot } from '../../shared/policy';
import { StationSettings } from '../features/settings/StationSettings';
import { DeviceTools } from '../features/mobile';
import { StationHealth } from '../features/health/StationHealth';
import { UtilityUpdates } from '../features/utilities/UtilityUpdates';
import { WORKSPACE_PAGE } from './navigation';
import { WorkspaceHeading } from './WorkspaceHeading';
import { ConnectedSources } from '../features/settings/ConnectedSources';

interface SettingsPageProps {
  policy: PolicySnapshot | undefined;
}
/**
 * Groups durable station preferences, local device choices and maintenance in one destination.
 * @param {SettingsPageProps} props - Current persisted station policy.
 * @param {PolicySnapshot | undefined} props.policy - Global transfer and completion preferences.
 * @returns {JSX.Element} Dedicated settings page with independent utility-update controls.
 */
export function SettingsPage({ policy }: SettingsPageProps) {
  return (
    <div className="settings-page">
      <WorkspaceHeading page={WORKSPACE_PAGE.settings} />
      <div className="settings-stack">
        <StationSettings policy={policy} />
        <DeviceTools />
        <section className="settings-card utility-settings">
          <h2>Download utilities</h2>
          <p>Keep your download engines current, review update status or restore a previous toolset.</p>
          <UtilityUpdates />
        </section>
        <StationHealth />
        <ConnectedSources />
      </div>
    </div>
  );
}
