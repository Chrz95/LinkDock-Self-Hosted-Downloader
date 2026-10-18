import type { DownloadArtifact } from '../../../../../shared/sources';
import { Icon } from '../../../../components/ui/Icon';
import { formatBytes } from '../../utils/formatDownload';
import { fileDeliveryUrl } from '../../services/fileDelivery';
import { MediaPreview } from './MediaPreview';

/** One published artifact uses only its server-owned manifest index in URLs. */
interface ArtifactRowProps {
  jobId: string;
  file: DownloadArtifact;
  fileIndex: number;
}
/**
 * Provides individual save and opt-in inline media without loading private files during collection rendering.
 * @param {ArtifactRowProps} props - Published file identity.
 * @param {string} props.jobId - Owning job UUID.
 * @param {DownloadArtifact} props.file - Published display name, size and opaque manifest path.
 * @param {number} props.fileIndex - Canonical server manifest position.
 * @returns {JSX.Element} Responsive artifact entry and preview region.
 */
export function ArtifactRow({ jobId, file, fileIndex }: ArtifactRowProps) {
  return (
    <li className="artifact-row">
      <div className="artifact-heading">
        <Icon name="file" />
        <span>
          {file.name}
          <small>{formatBytes(file.sizeBytes)}</small>
        </span>
        <a
          className="icon-button"
          href={fileDeliveryUrl(jobId, false, fileIndex)}
          aria-label={`Save ${file.name} to this device`}
        >
          <Icon name="download" />
        </a>
      </div>
      <MediaPreview
        jobId={jobId}
        filename={file.name}
        sizeBytes={file.sizeBytes}
        fileIndex={fileIndex}
      />
    </li>
  );
}
