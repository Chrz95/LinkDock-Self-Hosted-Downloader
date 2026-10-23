import path from 'node:path';
import { sessionUserAgent } from '../browserAccess/sessions.js';
import { deviantartArguments } from '../deviantart/arguments.js';
import type { DeviantartExecution } from '../deviantart/session.js';
import { ENGINE_LIMIT, MEDIA_LINE } from './constants.js';
import { SOURCE_TYPE, isGallerySource } from '../../shared/sources.js';
import { mediaFormatArguments } from './mediaFormat.js';
import type { DownloadJob } from '../../shared/contracts.js';
import type { BrowserAccessState } from '../browserAccess/store.js';

/**
 * Constructs fixed executable arguments; submitted URLs always follow the option terminator.
 * @param {DownloadJob} job - Site media request.
 * @param {string} outputDirectory - Isolated writable job directory.
 * @param {string} proxyUrl - Public-address-only local proxy.
 * @param {number} maximumBytes - Configured per-job byte limit.
 * @param {string} [cookiesFile] - Optional owner-mounted Netscape cookie jar.
 * @param {number} [bytesPerSecond] - Assigned download speed, zero for unlimited.
 * @param {BrowserAccessState} [browser] - Validated owner browser identity and pacing settings.
 * @param {DeviantartExecution} [deviantartSession] - Source preferences and private execution paths.
 * @returns {string[]} Safe argument vector for the selected media engine.
 */
export function buildMediaArguments(
  job: DownloadJob,
  outputDirectory: string,
  proxyUrl: string,
  maximumBytes: number,
  cookiesFile?: string,
  bytesPerSecond = 0,
  browser?: BrowserAccessState,
  deviantartSession?: DeviantartExecution,
): string[] {
  const userAgent = browser ? sessionUserAgent(browser, job.url) : '';
  const progressFields = 'downloaded_bytes,total_bytes,total_bytes_estimate,speed,status';
  const cookiesArguments = cookiesFile ? ['--cookies', cookiesFile] : [];
  if (isGallerySource(job.sourceType)) {
    const deviantart = job.sourceType === SOURCE_TYPE.deviantart;
    return [
      '--config-ignore',
      '--no-input',
      '--no-colors',
      '--proxy',
      proxyUrl,
      deviantart ? '--destination' : '--directory',
      outputDirectory,
      '--cache-file',
      deviantart ? (deviantartSession?.cacheFile ?? ':memory:') : ':memory:',
      ...(deviantart
        ? deviantartArguments(deviantartSession, job.deviantart)
        : [
            '-o',
            'filename={category}_{post_id}_{num}.{extension}',
            '-o',
            'extractor.instagram.videos=merged',
            '-o',
            'extractor.instagram.user-cache=memory',
          ]),
      '-o',
      'extractor.cookies-update=false',
      ...(bytesPerSecond ? ['--limit-rate', String(bytesPerSecond)] : []),
      ...cookiesArguments,
      ...(userAgent ? ['--user-agent', userAgent] : []),
      '--',
      job.url,
    ];
  }
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
    '--extractor-retries',
    String(ENGINE_LIMIT.mediaRetryCount),
    ...(userAgent ? ['--user-agent', userAgent] : []),
    ...(browser?.delaySeconds
      ? ['--sleep-requests', String(browser.delaySeconds), '--sleep-interval', String(browser.delaySeconds)]
      : []),
    ...mediaFormatArguments(job.quality),
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
