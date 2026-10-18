import type { StationWorkspaceProps } from './StationWorkspace.types';
import { WORKSPACE_PAGE } from './navigation';
import { PageView } from './PageView';
import { OverviewPage } from './OverviewPage';
import { LibraryPage } from './LibraryPage';
import { SettingsPage } from './SettingsPage';

/**
 * Keeps page drafts alive while queue polling and authentication remain owned by the application shell.
 * @param {StationWorkspaceProps} props - Active page, data and commands.
 * @param {WorkspacePage} props.page - Selected workspace page.
 * @param {DashboardSnapshot} props.snapshot - Current queue and storage metrics.
 * @param {string | null} props.busyJobId - Transfer with a pending mutation.
 * @param {StationWorkspaceProps['onAdd']} props.onAdd - Adds a link.
 * @param {StationWorkspaceProps['onUpload']} props.onUpload - Adds torrent metadata.
 * @param {StationWorkspaceProps['onAction']} props.onAction - Mutates an existing transfer.
 * @param {StationWorkspaceProps['onBatch']} [props.onBatch] - Queues a reviewed batch atomically.
 * @param {StationWorkspaceProps['onOrganize']} [props.onOrganize] - Saves tags and folder labels.
 * @param {StationWorkspaceProps['onBulk']} [props.onBulk] - Applies reviewed bulk library actions.
 * @returns {JSX.Element} One visible workspace page and a shared footer.
 */
export function StationWorkspace({
  page,
  snapshot,
  busyJobId,
  onAdd,
  onUpload,
  onAction,
  onBatch,
  onOrganize,
  onBulk,
}: StationWorkspaceProps) {
  return (
    <div className="station-content">
      <PageView active={page === WORKSPACE_PAGE.overview}>
        <OverviewPage
          snapshot={snapshot}
          onAdd={onAdd}
          onUpload={onUpload}
          onBatch={onBatch}
        />
      </PageView>
      <PageView active={page === WORKSPACE_PAGE.library}>
        <LibraryPage
          snapshot={snapshot}
          busyJobId={busyJobId}
          onAction={onAction}
          onOrganize={onOrganize}
          onBulk={onBulk}
        />
      </PageView>
      <PageView active={page === WORKSPACE_PAGE.settings}>
        <SettingsPage policy={snapshot.policy} />
      </PageView>
      <footer className="page-footer">
        <span>
          LINKDOCK <span>/</span> THE INTERNET, ON YOUR TERMS.
        </span>
        <span>Private storage. Open possibilities.</span>
      </footer>
    </div>
  );
}
