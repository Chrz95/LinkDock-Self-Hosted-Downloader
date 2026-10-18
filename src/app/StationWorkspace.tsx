import { AddDownload } from '../features/downloads/components/AddDownload';
import { Overview } from '../features/downloads/components/Overview';
import { DownloadList } from '../features/downloads/components/DownloadList';
import { StorageCard } from '../features/downloads/components/StorageCard';
import { Icon } from '../components/ui/Icon';
import type { StationWorkspaceProps } from './StationWorkspace.types';
import { StationSettings } from '../features/settings/StationSettings';
import { StationHeading } from './StationHeading';
import { DeviceTools } from '../features/mobile';
import { StationHealth } from '../features/health/StationHealth';

/**
 * Composes the authenticated workspace with a clear hierarchy from overview to collection.
 * @param {StationWorkspaceProps} props - Data and commands.
 * @param {DashboardSnapshot} props.snapshot - Current queue and storage metrics.
 * @param {string | null} props.busyJobId - Transfer with a pending mutation.
 * @param {StationWorkspaceProps['onAdd']} props.onAdd - Adds a link.
 * @param {StationWorkspaceProps['onUpload']} props.onUpload - Adds torrent metadata.
 * @param {StationWorkspaceProps['onAction']} props.onAction - Mutates an existing transfer.
 * @param {StationWorkspaceProps['onBatch']} [props.onBatch] - Queues a reviewed batch atomically.
 * @param {StationWorkspaceProps['onOrganize']} [props.onOrganize] - Saves tags and folder labels.
 * @returns {JSX.Element} Complete station content.
 */
export function StationWorkspace({
  snapshot,
  busyJobId,
  onAdd,
  onUpload,
  onAction,
  onBatch,
  onOrganize,
}: StationWorkspaceProps) {
  return (
    <div className="station-content">
      <StationHeading />
      <Overview snapshot={snapshot} />
      <AddDownload
        onAdd={onAdd}
        onUpload={onUpload}
        onBatch={onBatch}
      />
      <StationSettings policy={snapshot.policy} />
      <DeviceTools />
      <StationHealth />
      <div className="dashboard-body">
        <div className="queue-column">
          <DownloadList
            jobs={snapshot.jobs}
            busyJobId={busyJobId}
            onAction={onAction}
            onOrganize={onOrganize}
          />
        </div>
        <aside className="insights-column">
          <StorageCard snapshot={snapshot} />
          <div className="quiet-note">
            <span>ALWAYS ON. ENTIRELY YOURS.</span>
            <h2>
              Close the tab.
              <br />
              Keep the momentum.
            </h2>
            <p>Your station carries on while you get on with everything else.</p>
            <div
              className="quiet-decoration"
              aria-hidden="true"
            >
              ↗
            </div>
          </div>
          <details className="connection-guide">
            <summary>
              About connected sources
              <Icon name="plus" />
            </summary>
            <p>Video mode supports sites handled by yt-dlp. Instagram saves photos, carousels and reels.</p>
            <p>
              Some sources require a signed-in cookie file. Follow the cookie setup in the included deployment guide.
            </p>
            <p>
              Torrents need reachable peers. Uploading can occur while a torrent downloads; seeding stops on completion.
            </p>
          </details>
        </aside>
      </div>
      <footer className="page-footer">
        <span>
          LINKDOCK <span>/</span> THE INTERNET, ON YOUR TERMS.
        </span>
        <span>Private storage. Open possibilities.</span>
      </footer>
    </div>
  );
}
