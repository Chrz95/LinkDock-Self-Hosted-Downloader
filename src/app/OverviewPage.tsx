import { StationHeading } from './StationHeading';
import type { StationWorkspaceProps } from './StationWorkspace.types';
import { Overview } from '../features/downloads/components/Overview';
import { AddDownload } from '../features/downloads/components/AddDownload';
import { StorageCard } from '../features/downloads/components/StorageCard';
import { Icon } from '../components/ui/Icon';
import { PAGE_INFO } from './navigation';

type OverviewPageProps = Pick<StationWorkspaceProps, 'snapshot' | 'onAdd' | 'onUpload' | 'onBatch'>;
/**
 * Keeps the starting page focused on adding links and the station's current capacity.
 * @param {OverviewPageProps} props - Live metrics and submission commands.
 * @param {DashboardSnapshot} props.snapshot - Queue totals and storage capacity.
 * @param {StationWorkspaceProps['onAdd']} props.onAdd - Adds a link.
 * @param {StationWorkspaceProps['onUpload']} props.onUpload - Adds uploaded torrent metadata.
 * @param {StationWorkspaceProps['onBatch']} [props.onBatch] - Queues reviewed links.
 * @returns {JSX.Element} Download composer, live totals and collection entry point.
 */
export function OverviewPage({ snapshot, onAdd, onUpload, onBatch }: OverviewPageProps) {
  return (
    <div className="overview-page">
      <StationHeading />
      <Overview snapshot={snapshot} />
      <AddDownload
        onAdd={onAdd}
        onUpload={onUpload}
        onBatch={onBatch}
      />
      {snapshot.policy?.holdReason && <output className="policy-hold">{snapshot.policy.holdReason}</output>}
      <div className="overview-details">
        <StorageCard snapshot={snapshot} />
        <section className="library-entry">
          <span className="composer-overline">FROM LINK TO LIBRARY</span>
          <h2>Keep an eye on the good stuff.</h2>
          <p>Follow your transfers, choose torrent files and browse everything saved on your station.</p>
          <a
            className="primary-button"
            href={PAGE_INFO.library.href}
          >
            Open download library
            <Icon name="arrow" />
          </a>
        </section>
      </div>
    </div>
  );
}
