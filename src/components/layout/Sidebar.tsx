import { Icon } from '../ui/Icon';
import { MobileNavigation } from './MobileNavigation';

/**
 * Presents station navigation and supported source families without invented connection states.
 * @returns {JSX.Element} Persistent desktop rail and compact mobile navigation.
 */
export function Sidebar() {
  return (
    <aside className="sidebar">
      <a
        className="brand"
        href="#main"
        aria-label="LinkDock home"
      >
        <span className="brand-symbol">
          <Icon name="download" />
        </span>
        LinkDock<span className="brand-period">.</span>
      </a>
      <MobileNavigation />
      <div className="station-identity">
        <span className="station-avatar">LD</span>
        <div>
          <strong>My station</strong>
          <span>Personal workspace</span>
        </div>
        <Icon name="lock" />
      </div>
      <div className="sidebar-section">WORKSPACE</div>
      <a
        href="#main"
        className="nav-item selected"
        aria-current="page"
      >
        <Icon name="grid" />
        Overview
      </a>
      <a
        href="#downloads"
        className="nav-item"
      >
        <Icon name="download" />
        Download library
      </a>
      <div className="sidebar-section source-section">DOWNLOAD SOURCES</div>
      <div className="source-legend">
        <span>
          <Icon name="video" />
          YouTube &amp; video
        </span>
        <span>
          <Icon name="camera" />
          Instagram
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
          SELF-HOSTED · V2.10
        </div>
      </div>
    </aside>
  );
}
