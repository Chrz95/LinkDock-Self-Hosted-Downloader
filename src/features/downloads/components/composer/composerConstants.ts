import { SOURCE_TYPE, VIDEO_QUALITY, AUDIO_QUALITY } from '../../../../../shared/sources';
/** Ordered source options with coherent visual identities. */
export const SOURCE_OPTIONS = [
  { value: SOURCE_TYPE.auto, label: 'Auto detect', icon: 'sparkle' },
  { value: SOURCE_TYPE.video, label: 'Video', icon: 'video' },
  { value: SOURCE_TYPE.instagram, label: 'Instagram', icon: 'camera' },
  { value: SOURCE_TYPE.torrent, label: 'Torrent', icon: 'torrent' },
  { value: SOURCE_TYPE.magnet, label: 'Magnet', icon: 'link' },
  { value: SOURCE_TYPE.direct, label: 'File', icon: 'file' },
] as const;
/** Video quality policies select existing source streams without re-encoding. */
export const QUALITY_OPTIONS = [
  { value: VIDEO_QUALITY.original, label: 'Best available' },
  { value: VIDEO_QUALITY.ultra, label: 'Up to 2160p · 4K' },
  { value: VIDEO_QUALITY.high, label: 'Up to 1440p' },
  { value: VIDEO_QUALITY.balanced, label: 'Up to 1080p' },
  { value: VIDEO_QUALITY.compact, label: 'Up to 720p' },
  { value: VIDEO_QUALITY.small, label: 'Up to 480p' },
  { value: VIDEO_QUALITY.smallest, label: 'Up to 360p' },
] as const;
/** Torrent metadata upload limit must match the server's bounded decoder. */
export const MAXIMUM_TORRENT_BYTES = 2_097_152;

export const AUDIO_OPTIONS = [
  { value: AUDIO_QUALITY.compact, label: '128 kbps · smaller files' },
  { value: AUDIO_QUALITY.balanced, label: '192 kbps · balanced' },
  { value: AUDIO_QUALITY.high, label: '320 kbps · high bitrate' },
] as const;
