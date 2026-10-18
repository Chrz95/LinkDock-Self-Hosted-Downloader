import path from 'node:path';
import { ENGINE_LIMIT, MEDIA_LINE } from './constants.js';
import { SOURCE_TYPE, VIDEO_QUALITY } from '../../shared/sources.js';
import type { DownloadJob } from '../../shared/contracts.js';

/**
 * Constructs fixed executable arguments; submitted URLs always follow the option terminator.
 * @param {DownloadJob} job - Site media request.
 * @param {string} outputDirectory - Isolated writable job directory.
 * @param {string} proxyUrl - Public-address-only local proxy.
 * @param {number} maximumBytes - Configured per-job byte limit.
 * @param {string} [cookiesFile] - Optional owner-mounted Netscape cookie jar.
 * @param {number} [bytesPerSecond] - Assigned download speed, zero for unlimited.
 * @returns {string[]} Safe argument vector for the selected media engine.
 */
export function buildMediaArguments(
  job: DownloadJob,
  outputDirectory: string,
  proxyUrl: string,
  maximumBytes: number,
  cookiesFile?: string,
  bytesPerSecond = 0,
): string[] {
  const progressFields = 'downloaded_bytes,total_bytes,total_bytes_estimate,speed,status';
  const cookiesArguments = cookiesFile ? ['--cookies', cookiesFile] : [];
  if (job.sourceType === SOURCE_TYPE.instagram) {
    return [
      '--config-ignore',
      '--no-input',
      '--no-colors',
      '--proxy',
      proxyUrl,
      '--directory',
      outputDirectory,
      '--cache-file',
      ':memory:',
      '-o',
      'filename={category}_{post_id}_{num}.{extension}',
      '-o',
      'extractor.instagram.videos=merged',
      '-o',
      'extractor.instagram.user-cache=memory',
      '-o',
      'extractor.cookies-update=false',
      ...(bytesPerSecond ? ['--limit-rate', String(bytesPerSecond)] : []),
      ...cookiesArguments,
      '--',
      job.url,
    ];
  }
  const quality = job.quality ?? VIDEO_QUALITY.balanced;
  const format = quality === VIDEO_QUALITY.original ? 'bv*+ba/b' : `bv*[height<=${quality}]+ba/b[height<=${quality}]`;
  return [
    '--ignore-config',
    '--no-playlist',
    '--continue',
    ...(bytesPerSecond ? ['--limit-rate', String(bytesPerSecond)] : []),
    '--no-colors',
    '--newline',
    '--no-cache-dir',
    '--no-plugin-dirs',
    '--no-remote-components',
    '--js-runtimes',
    'node',
    '--proxy',
    proxyUrl,
    '--socket-timeout',
    String(ENGINE_LIMIT.mediaSocketTimeoutSeconds),
    '--retries',
    String(ENGINE_LIMIT.mediaRetryCount),
    '--fragment-retries',
    String(ENGINE_LIMIT.mediaRetryCount),
    '--format',
    format,
    '--merge-output-format',
    'mkv',
    '--max-filesize',
    String(maximumBytes),
    '--output',
    path.join(outputDirectory, '%(title).130B [%(id)s].%(ext)s'),
    '--progress-template',
    `download:${MEDIA_LINE.progress}%(progress.{${progressFields}})j`,
    '--print',
    `before_dl:${MEDIA_LINE.title}%(title)j`,
    '--no-simulate',
    ...cookiesArguments,
    '--',
    job.url,
  ];
}
