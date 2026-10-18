import { VIDEO_QUALITY, isAudioQuality, type DownloadQuality } from '../../shared/sources.js';
const AUDIO_PREFIX = 'mp3-';
/**
 * Selects source streams or requests a real ffmpeg MP3 conversion with a fixed bitrate.
 * @param {DownloadQuality | undefined} quality - Validated persisted representation.
 * @returns {string[]} Fixed yt-dlp format and conversion arguments.
 */
export function mediaFormatArguments(quality?: DownloadQuality): string[] {
  if (isAudioQuality(quality)) {
    return [
      '--format',
      'ba/b',
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      `${quality.slice(AUDIO_PREFIX.length)}K`,
      '--no-keep-video',
    ];
  }
  const height = quality ?? VIDEO_QUALITY.balanced;
  const format = height === VIDEO_QUALITY.original ? 'bv*+ba/b' : `bv*[height<=${height}]+ba/b[height<=${height}]`;
  return ['--format', format, '--merge-output-format', 'mkv'];
}
