import { Icon } from '../../components/ui/Icon';
import { InstallApp } from './InstallApp';
import { NotificationControls } from './NotificationControls';

/**
 * Groups optional device capabilities separately from station-wide transfer preferences.
 * @returns {JSX.Element} Install, sharing and encrypted alert controls.
 */
export function DeviceTools() {
  return (
    <details className="station-settings device-tools">
      <summary>
        <Icon name="sparkle" />
        <span>
          On this device<small>Install, share links &amp; receive optional alerts</small>
        </span>
        <Icon name="plus" />
      </summary>
      <div className="device-tools-content">
        <InstallApp />
        <NotificationControls />
      </div>
    </details>
  );
}
