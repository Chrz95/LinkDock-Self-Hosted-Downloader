import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { useDownloads } from '../features/downloads/hooks/useDownloads';
import { UnlockStation } from '../features/session/UnlockStation';
import { StationWorkspace } from './StationWorkspace';

/**
 * Owns authentication and connectivity while the workspace composes the download features.
 * @returns {JSX.Element} Password gate, connection state or private workspace.
 */
export function App() {
  const station = useDownloads();
  if (station.isLocked) {
    return <UnlockStation onUnlock={station.unlockStation} />;
  }
  return (
    <div className="app-shell">
      <a
        href="#main"
        className="skip-link"
      >
        Skip to downloads
      </a>
      <Sidebar />
      <div className="workspace">
        <Header
          isConnected={Boolean(station.snapshot) && !station.errorMessage}
          onLock={station.lockStation}
        />
        <main
          id="main"
          className="main-content"
        >
          {station.errorMessage && (
            <p
              className="connection-error"
              role="alert"
            >
              {station.errorMessage}
            </p>
          )}
          {station.snapshot ? (
            <StationWorkspace
              snapshot={station.snapshot}
              busyJobId={station.busyJobId}
              onAdd={station.queueDownload}
              onUpload={station.queueTorrent}
              onAction={station.handleJobAction}
              onBatch={station.queueBatch}
              onOrganize={station.organizeJob}
            />
          ) : (
            <output className="loading-state">Connecting to your station…</output>
          )}
        </main>
      </div>
    </div>
  );
}
