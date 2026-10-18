import { AUDIO_QUALITY, VIDEO_QUALITY, isAudioQuality, type DownloadQuality } from '../../../../../shared/sources';
import { QUALITY_OPTIONS, AUDIO_OPTIONS } from './composerConstants';
interface MediaQualityOptionsProps {
  quality: DownloadQuality;
  isDisabled: boolean;
  onChange: (quality: DownloadQuality) => void;
}
/**
 * Separates file format from source resolution or MP3 bitrate without exposing engine arguments.
 * @param {MediaQualityOptionsProps} props - Controlled representation.
 * @param {DownloadQuality} props.quality - Video height or fixed MP3 bitrate choice.
 * @param {boolean} props.isDisabled - Whether submission is pending.
 * @param {(quality: DownloadQuality) => void} props.onChange - Saves the chosen representation.
 * @returns {JSX.Element} Touch-friendly format and quality selectors.
 */
export function MediaQualityOptions({ quality, isDisabled, onChange }: MediaQualityOptionsProps) {
  const audio = isAudioQuality(quality);
  const options = audio ? AUDIO_OPTIONS : QUALITY_OPTIONS;
  return (
    <div className="media-quality-options">
      <label className="quality-selector">
        Output format
        <select
          value={audio ? 'mp3' : 'video'}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value === 'mp3' ? AUDIO_QUALITY.balanced : VIDEO_QUALITY.balanced)}
        >
          <option value="video">Video</option>
          <option value="mp3">MP3 audio</option>
        </select>
      </label>
      <label className="quality-selector">
        {audio ? 'Audio quality' : 'Video quality'}
        <select
          value={quality}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value as DownloadQuality)}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {audio && <small>MP3 converts the source audio. A higher bitrate cannot restore missing detail.</small>}
    </div>
  );
}
