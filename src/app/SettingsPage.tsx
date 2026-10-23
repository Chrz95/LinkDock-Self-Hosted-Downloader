import type { PolicySnapshot } from '../../shared/policy';
import { StationSettings } from '../features/settings/StationSettings';
import { DeviceTools } from '../features/mobile';
import { StationHealth } from '../features/health/StationHealth';
import { UtilityUpdates } from '../features/utilities/UtilityUpdates';
import { WORKSPACE_PAGE } from './navigation';
import { WorkspaceHeading } from './WorkspaceHeading';
import { ConnectedSources } from '../features/settings/ConnectedSources';
import { DeviantartSettings } from '../features/settings/DeviantartSettings';
import { BrowserAccess } from '../features/settings/BrowserAccess';

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
        <section
          className="settings-group"
          aria-label="Downloads"
        >
          <h2>Downloads</h2>
          <p>Choose where files go, speed limits and download times.</p>
          <StationSettings policy={policy} />
        </section>
        <section
          className="settings-group"
          aria-label="Accounts and browser sessions"
        >
          <h2>Accounts &amp; browser sessions</h2>
          <p>Connect the sites you use. Saved access does not guarantee every item is downloadable.</p>
          <BrowserAccess />
          <DeviantartSettings />
        </section>
        <section
          className="settings-group"
          aria-label="This device"
        >
          <h2>This device</h2>
          <DeviceTools />
        </section>
        <section
          className="settings-group"
          aria-label="Maintenance"
        >
          <h2>Maintenance</h2>
          <UtilityUpdates />
          <StationHealth />
          <ConnectedSources />
        </section>
      </div>
    </div>
  );
}
