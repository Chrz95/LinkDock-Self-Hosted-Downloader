import type { DashboardSnapshot } from '../../../../shared/contracts';
import { Icon } from '../../../components/ui/Icon';
import { DISPLAY } from '../constants';
import { formatBytes } from '../utils/formatDownload';

/** Filesystem information supplied by the server. */
interface StorageCardProps {
  snapshot: DashboardSnapshot;
}
/**
 * Reports capacity of the actual mounted download filesystem, including other files on it.
 * @param {StorageCardProps} props - Server capacity data.
 * @param {DashboardSnapshot} props.snapshot - Filesystem and transfer limits.
 * @returns {JSX.Element} Storage summary with native meter.
 */
export function StorageCard({ snapshot }: StorageCardProps) {
  const usedBytes = snapshot.storage.totalBytes - snapshot.storage.availableBytes;
  const usedPercent = snapshot.storage.totalBytes ? (usedBytes / snapshot.storage.totalBytes) * DISPLAY.percent : 0;
  return (
    <section
      className="storage-card"
      aria-labelledby="storage-title"
    >
      <div className="storage-title">
        <span className="storage-icon">
          <Icon name="drive" />
        </span>
        <div>
          <h2 id="storage-title">Room for more.</h2>
          <p>Your station’s storage</p>
        </div>
      </div>
      <div className="storage-value">
        {formatBytes(snapshot.storage.availableBytes)} <span>available</span>
      </div>
      <meter
        min="0"
        max={DISPLAY.percent}
        value={usedPercent}
        aria-label="Disk space used"
      />
      <div className="storage-legend">
        <span>{formatBytes(usedBytes)} used</span>
        <span>{formatBytes(snapshot.storage.totalBytes)} total</span>
      </div>
      <p className="storage-note">
        Shared filesystem capacity · {formatBytes(snapshot.maximumFileBytes)} per file limit
      </p>
    </section>
  );
}
