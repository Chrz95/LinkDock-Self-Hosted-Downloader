import { CookieFailurePrompt } from '../features/downloads/components/library/CookieFailurePrompt';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { useDownloads } from '../features/downloads/hooks/useDownloads';
import { UnlockStation } from '../features/session/UnlockStation';
import { StationWorkspace } from './StationWorkspace';
import { useWorkspacePage } from './useWorkspacePage';

/**
 * Owns authentication and connectivity while the workspace composes the download features.
 * @returns {JSX.Element} Password gate, connection state or private workspace.
 */
export function App() {
  const station = useDownloads();
  const page = useWorkspacePage();
  if (station.isLocked) {
    return <UnlockStation onUnlock={station.unlockStation} />;
  }
  return (
    <div className="app-shell">
      <a
        href="#main"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      {station.snapshot && <CookieFailurePrompt jobs={station.snapshot.jobs} />}
      <Sidebar page={page} />
      <div className="workspace">
        <Header
          page={page}
          isConnected={Boolean(station.snapshot) && !station.errorMessage}
          onLock={station.lockStation}
        />
        <main
          id="main"
          tabIndex={-1}
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
              page={page}
              snapshot={station.snapshot}
              busyJobId={station.busyJobId}
              onAdd={station.queueDownload}
              onUpload={station.queueTorrent}
              onAction={station.handleJobAction}
              onBatch={station.queueBatch}
              onOrganize={station.organizeJob}
              onBulk={station.handleLibraryAction}
            />
          ) : (
            <output className="loading-state">Connecting to your station…</output>
          )}
        </main>
      </div>
    </div>
  );
}
