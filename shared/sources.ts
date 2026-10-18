/** Supported download engines, shared by request validation and source selection. */
export const SOURCE_TYPE = {
  auto: 'auto',
  direct: 'direct',
  video: 'video',
  instagram: 'instagram',
  torrent: 'torrent',
  magnet: 'magnet',
} as const;
/** Source type explicitly requested by a user or resolved by automatic detection. */
export type SourceType = (typeof SOURCE_TYPE)[keyof typeof SOURCE_TYPE];
/** Quality selection keeps Raspberry Pi defaults practical without transcoding. */
export const VIDEO_QUALITY = {
  balanced: '1080',
  original: 'best',
  compact: '720',
  ultra: '2160',
  high: '1440',
  small: '480',
  smallest: '360',
} as const;
export const AUDIO_QUALITY = { compact: 'mp3-128', balanced: 'mp3-192', high: 'mp3-320' } as const;
export type AudioQuality = (typeof AUDIO_QUALITY)[keyof typeof AUDIO_QUALITY];
export const DOWNLOAD_QUALITY = {
  ...VIDEO_QUALITY,
  audioCompact: AUDIO_QUALITY.compact,
  audioBalanced: AUDIO_QUALITY.balanced,
  audioHigh: AUDIO_QUALITY.high,
} as const;
export type DownloadQuality = VideoQuality | AudioQuality;
/** Checks the fixed MP3 representation whitelist.
 * @param {unknown} value - Submitted or persisted representation.
 * @returns {boolean} Whether it requests MP3 extraction.
 */
export function isAudioQuality(value: unknown): value is AudioQuality {
  return Object.values(AUDIO_QUALITY).some((quality) => quality === value);
}
/** Maximum video height or best available source quality. */
export type VideoQuality = (typeof VIDEO_QUALITY)[keyof typeof VIDEO_QUALITY];
/** Input accepted by the authenticated queue. */
export interface DownloadRequest {
  url: string;
  sourceType?: SourceType;
  quality?: DownloadQuality;
}
/** Completed artifact contained in a job's isolated output directory. */
export interface DownloadArtifact {
  name: string;
  relativePath: string;
  sizeBytes: number;
}
/** Product-facing names for source badges and controls. */
export const SOURCE_LABEL = {
  auto: 'Auto detect',
  direct: 'Direct file',
  video: 'Video',
  instagram: 'Instagram',
  torrent: 'Torrent',
  magnet: 'Magnet',
} as const;

/** Internal and peer source identifiers shared by history validation and presentation. */
export const SOURCE_URL = {
  uploadedTorrent: 'torrent-file:',
  magnetProtocol: 'magnet:',
  infoHashTopic: 'urn:btih:',
} as const;
