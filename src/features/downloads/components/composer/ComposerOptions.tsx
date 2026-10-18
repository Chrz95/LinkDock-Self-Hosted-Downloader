import type { RefObject, ChangeEvent } from 'react';
import type { DownloadQuality } from '../../../../../shared/sources';
import { Icon } from '../../../../components/ui/Icon';
import { MediaQualityOptions } from './MediaQualityOptions';

/** Quality and metadata upload controls. */
interface ComposerOptionsProps {
  quality: DownloadQuality;
  isDisabled: boolean;
  supportsMedia: boolean;
  canUpload: boolean;
  fileInput: RefObject<HTMLInputElement | null>;
  onQualityChange: (quality: DownloadQuality) => void;
  onTorrentUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}
/**
 * Keeps video quality and torrent upload available without crowding the link field.
 * @param {ComposerOptionsProps} props - Controlled options.
 * @param {DownloadQuality} props.quality - Preferred maximum height.
 * @param {boolean} props.isDisabled - Pending submission state.
 * @param {boolean} props.supportsMedia - Whether the selected engine supports video and MP3 choices.
 * @param {boolean} props.canUpload - Whether upload is supported by the parent.
 * @param {RefObject<HTMLInputElement | null>} props.fileInput - Native file picker reference.
 * @param {(quality: DownloadQuality) => void} props.onQualityChange - Updates quality preference.
 * @param {(event: ChangeEvent<HTMLInputElement>) => Promise<void>} props.onTorrentUpload - Submits metadata.
 * @returns {JSX.Element} Compact secondary controls.
 */
export function ComposerOptions({
  quality,
  isDisabled,
  supportsMedia,
  canUpload,
  fileInput,
  onQualityChange,
  onTorrentUpload,
}: ComposerOptionsProps) {
  return (
    <div className="composer-options">
      <MediaQualityOptions
        quality={quality}
        isDisabled={isDisabled || !supportsMedia}
        onChange={onQualityChange}
      />
      {canUpload && (
        <div className="torrent-upload">
          <input
            className="visually-hidden"
            type="file"
            ref={fileInput}
            accept=".torrent,application/x-bittorrent"
            aria-label="Upload torrent file"
            disabled={isDisabled}
            onChange={(event) => void onTorrentUpload(event)}
          />
          <button
            type="button"
            className="upload-button"
            disabled={isDisabled}
            onClick={() => fileInput.current?.click()}
          >
            <Icon name="upload" />
            Upload .torrent
          </button>
        </div>
      )}
      <span className="composer-privacy">
        <Icon name="lock" /> Saved on your Pi
      </span>
    </div>
  );
}
