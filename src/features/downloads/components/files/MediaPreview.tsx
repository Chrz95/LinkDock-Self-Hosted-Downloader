import { getPreviewFormat, DELIVERY_LIMIT } from '../../../../../shared/media';
import { fileDeliveryUrl } from '../../services/fileDelivery';
import { useMediaPreview } from './useMediaPreview';

/** File identity is taken from the published manifest rather than an external media URL. */
export interface MediaPreviewProps {
  jobId: string;
  filename: string;
  sizeBytes: number;
  fileIndex?: number;
}
/**
 * Opens original raster images or native video on request, with a persistent ordinary-download fallback.
 * @param {MediaPreviewProps} props - Saved file identity.
 * @param {string} props.jobId - Owning job UUID.
 * @param {string} props.filename - Published display name.
 * @param {number} props.sizeBytes - Saved size for the client-side image ceiling.
 * @param {number} [props.fileIndex] - Optional manifest position.
 * @returns {JSX.Element | null} Explicit preview control and native media player.
 */
export function MediaPreview({ jobId, filename, sizeBytes, fileIndex }: MediaPreviewProps) {
  const format = getPreviewFormat(filename);
  const url = fileDeliveryUrl(jobId, true, fileIndex);
  const preview = useMediaPreview(url);
  const saveUrl = fileDeliveryUrl(jobId, false, fileIndex);
  if (!format || (format.kind === 'image' && sizeBytes > DELIVERY_LIMIT.maximumImageBytes)) {
    return null;
  }
  return (
    <div className="media-preview">
      <button
        type="button"
        className="preview-button"
        disabled={preview.isChecking}
        aria-label={`${preview.isOpen ? 'Close preview for' : 'Preview'} ${filename}`}
        aria-expanded={preview.isOpen}
        onClick={() => void preview.toggle()}
      >
        {preview.isChecking ? 'Checking file…' : preview.isOpen ? 'Close preview' : `Preview ${format.kind}`}
      </button>
      {preview.isOpen && (
        <figure>
          {format.kind === 'image' ? (
            <img
              src={url}
              alt={filename}
              loading="lazy"
              onError={preview.failed}
              referrerPolicy="no-referrer"
            />
          ) : (
            <video
              src={url}
              controls
              playsInline
              muted
              preload="metadata"
              onError={preview.failed}
              aria-label={`Video preview for ${filename}`}
            />
          )}
          <figcaption>
            {format.kind === 'video' ? 'Preview starts muted. Enable sound in the player. ' : 'Original file. '}
            <a href={saveUrl}>Save original</a>
          </figcaption>
        </figure>
      )}
      {preview.errorMessage && (
        <p
          className="form-error"
          role="alert"
        >
          {preview.errorMessage} <a href={saveUrl}>Save file</a>
        </p>
      )}
    </div>
  );
}
