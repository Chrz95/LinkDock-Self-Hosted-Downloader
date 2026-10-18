import { DownloadList } from '../features/downloads/components/DownloadList';
import type { StationWorkspaceProps } from './StationWorkspace.types';
import { WORKSPACE_PAGE } from './navigation';
import { WorkspaceHeading } from './WorkspaceHeading';

type LibraryPageProps = Pick<StationWorkspaceProps, 'snapshot' | 'busyJobId' | 'onAction' | 'onOrganize' | 'onBulk'>;
/**
 * Gives saved files and in-progress transfers a dedicated filterable page.
 * @param {LibraryPageProps} props - Live collection and existing mutation handlers.
 * @param {DashboardSnapshot} props.snapshot - Latest queue and scheduler hold.
 * @param {string | null} props.busyJobId - Record with a pending mutation.
 * @param {StationWorkspaceProps['onAction']} props.onAction - Transfer actions.
 * @param {StationWorkspaceProps['onOrganize']} [props.onOrganize] - Label changes.
 * @param {StationWorkspaceProps['onBulk']} [props.onBulk] - Reviewed bulk actions.
 * @returns {JSX.Element} Collection page with all existing file controls.
 */
export function LibraryPage({ snapshot, busyJobId, onAction, onOrganize, onBulk }: LibraryPageProps) {
  return (
    <div className="library-page">
      <WorkspaceHeading page={WORKSPACE_PAGE.library} />
      {snapshot.policy?.holdReason && <output className="policy-hold">{snapshot.policy.holdReason}</output>}
      <DownloadList
        jobs={snapshot.jobs}
        busyJobId={busyJobId}
        onAction={onAction}
        onOrganize={onOrganize}
        onBulk={onBulk}
      />
    </div>
  );
}
