import { Icon } from '../ui/Icon';
import { MobileNavigation } from './MobileNavigation';
import { WorkspaceNavigation } from './WorkspaceNavigation';
import { PAGE_INFO, type WorkspaceNavigationProps } from '../../app/navigation';

/**
 * Presents station navigation and supported source families without invented connection states.
 * @param {WorkspaceNavigationProps} props - Active route.
 * @param {WorkspacePage} props.page - Current page for desktop and phone links.
 * @returns {JSX.Element} Persistent desktop rail and compact mobile navigation.
 */
export function Sidebar({ page }: WorkspaceNavigationProps) {
  return (
    <aside className="sidebar">
      <a
        className="brand"
        href={PAGE_INFO.overview.href}
        aria-label="LinkDock home"
      >
        <span className="brand-symbol">
          <Icon name="download" />
        </span>
        LinkDock<span className="brand-period">.</span>
      </a>
      <MobileNavigation page={page} />
      <div className="station-identity">
        <span className="station-avatar">LD</span>
        <div>
          <strong>My station</strong>
          <span>Personal workspace</span>
        </div>
        <Icon name="lock" />
      </div>
      <div className="sidebar-section">WORKSPACE</div>
      <WorkspaceNavigation page={page} />
      <div className="sidebar-section source-section">DOWNLOAD SOURCES</div>
      <div className="source-legend">
        <span>
          <Icon name="video" />
          YouTube &amp; video
        </span>
        <span>
          <Icon name="camera" />
          Instagram &amp; DeviantArt
        </span>
        <span>
          <Icon name="torrent" />
          Torrents &amp; magnets
        </span>
        <span>
          <Icon name="link" />
          Direct links
        </span>
      </div>
      <div className="sidebar-bottom">
        <div
          className="station-emblem"
          aria-hidden="true"
        >
          <Icon name="sparkle" />
        </div>
        <h2>
          The good stuff.
          <br />
          All in one place.
        </h2>
        <p>
          Your own corner of the internet.
          <br />
          No storage subscription required.
        </p>
        <div className="device-label">
          <Icon name="drive" />
          SELF-HOSTED · V2.22
        </div>
      </div>
    </aside>
  );
}
