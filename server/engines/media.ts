import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_TYPE, isGallerySource } from '../../shared/sources.js';
import type { DownloadJob } from '../../shared/contracts.js';
import type { ServerConfig } from '../config.js';
import { ENGINE_LIMIT, MEDIA_LINE } from './constants.js';
import { buildMediaArguments } from './mediaArguments.js';
import { createPublicProxy } from './publicProxy.js';
import { deviantartFailure } from '../deviantart/failure.js';
import { runEngineProcess } from './runProcess.js';
import { prepareMediaCookies } from './cookies.js';
import { resolveUtility } from '../utilities/resolve.js';
import { ensureStorage } from '../policy/storage.js';
import { cookiesForSource } from '../browserAccess/sessions.js';
import { BrowserAccessStore } from '../browserAccess/store.js';
import { acquireDeviantartLock } from '../deviantart/lock.js';
import { prepareDeviantartSession, type DeviantartExecution } from '../deviantart/session.js';
import { createDeviantartProgress } from '../deviantart/progress.js';

/**
 * Counts staging bytes, including temporary merge files, without following symlinks.
 * @param {string} directory - Isolated worker directory.
 * @param {number} [depth] - Current bounded directory nesting.
 * @param {{files: number}} [state] - Shared file budget for this single measurement.
 * @returns {Promise<number>} Current bytes present on disk.
 */
export async function countStagingBytes(directory: string, depth = 0, state = { files: 0 }): Promise<number> {
  if (depth > ENGINE_LIMIT.maximumDirectoryDepth) {
    throw new Error('Media output exceeds the directory nesting limit.');
  }
  let totalBytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error('Symbolic links are not allowed in output.');
    }
    const filename = path.join(directory, entry.name);
    try {
      if (entry.isDirectory()) {
        totalBytes += await countStagingBytes(filename, depth + 1, state);
      } else {
        state.files += 1;
        if (state.files > ENGINE_LIMIT.maximumFiles) {
          throw new Error('Media output exceeds the maximum file count.');
        }
        totalBytes += (await stat(filename)).size;
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }
    }
  }
  return totalBytes;
}

/**
 * Applies yt-dlp's JSON progress without treating human console text as an API.
 * @param {DownloadJob} job - Live progress record.
 * @param {string} line - One stdout line.
 */
export function applyMediaProgress(job: DownloadJob, line: string): void {
  const titlePrefix = MEDIA_LINE.title;
  if (line.startsWith(titlePrefix)) {
    try {
      const title: unknown = JSON.parse(line.slice(titlePrefix.length));
      if (typeof title === 'string') {
        job.filename = title;
      }
    } catch {
      /* A malformed title must not interrupt valid video bytes. */
    }
    return;
  }
  const prefix = MEDIA_LINE.progress;
  if (/\b(?:sleeping|waiting)\b.*\bseconds?\b/iu.test(line)) {
    job.stage = 'Respecting source wait time';
  }
  if (!line.startsWith(prefix)) {
    return;
  }
  try {
    const progress = JSON.parse(line.slice(prefix.length)) as Record<string, unknown>;
    if (typeof progress.downloaded_bytes === 'number') {
      job.receivedBytes = progress.downloaded_bytes;
    }
    const total = progress.total_bytes || progress.total_bytes_estimate;
    if (typeof total === 'number') {
      job.totalBytes = total;
    }
    if (typeof progress.speed === 'number') {
      job.bytesPerSecond = progress.speed;
    }
    job.stage = progress.status === 'finished' ? 'Finishing media' : 'Downloading media';
  } catch {
    /* Non-JSON plugin output is not transfer progress. */
  }
}

/**
 * Serializes DeviantArt workers before reading account state; other source engines remain concurrent.
 * @param {DownloadJob} job - Source request and visible progress.
 * @param {string} outputDirectory - Isolated output staging directory.
 * @param {AbortSignal} signal - Queue pause/cancel signal.
 * @param {ServerConfig} configuration - Station limits and private state mount.
 * @returns {Promise<void>} Completed staged media.
 */
export async function downloadMedia(
  job: DownloadJob,
  outputDirectory: string,
  signal: AbortSignal,
  configuration: ServerConfig,
): Promise<void> {
  if (job.sourceType !== SOURCE_TYPE.deviantart) {
    return runMediaDownload(job, outputDirectory, signal, configuration);
  }
  job.stage = 'Waiting for DeviantArt account';
  const release = await acquireDeviantartLock(configuration.dataDirectory, signal);
  try {
    signal.throwIfAborted();
    const session = await prepareDeviantartSession(configuration.dataDirectory, job.deviantart);
    try {
      await runMediaDownload(job, outputDirectory, signal, configuration, session);
    } finally {
      await session.cleanup();
    }
  } finally {
    release();
  }
}

/**
 * Downloads one site video or gallery through checked public egress and a bounded worker.
 * @param {DownloadJob} job - Site request.
 * @param {string} outputDirectory - Isolated staging location.
 * @param {AbortSignal} signal - Queue cancellation.
 * @param {ServerConfig} configuration - Limits and optional authentication cookie jar.
 * @param {DeviantartExecution} [deviantartSession] - Source preferences and private credential paths.
 * @returns {Promise<void>} Complete staged output.
 */
async function runMediaDownload(
  job: DownloadJob,
  outputDirectory: string,
  signal: AbortSignal,
  configuration: ServerConfig,
  deviantartSession?: DeviantartExecution,
): Promise<void> {
  const initialBytes = await countStagingBytes(outputDirectory);
  ensureStorage(outputDirectory, configuration.reservedFreeBytes ?? 0);
  const browser = new BrowserAccessStore(configuration.dataDirectory).read();
  const tool = isGallerySource(job.sourceType) ? 'instagram' : 'video';
  const execution = resolveUtility(tool, configuration.dataDirectory, configuration.runtimeEnvironment);
  const cookies = await prepareMediaCookies(
    configuration.dataDirectory,
    configuration.mediaCookiesFile,
    cookiesForSource(browser, job.url),
  );
  const proxy = await createPublicProxy().catch(async (error: unknown) => {
    await cookies.cleanup();
    throw error;
  });
  const controller = new AbortController();
  const combinedSignal = AbortSignal.any([signal, controller.signal]);
  const deviantartProgress =
    job.sourceType === SOURCE_TYPE.deviantart ? createDeviantartProgress(job, controller, initialBytes) : undefined;
  job.stage = 'Connecting to source';
  let measurement: Promise<void> | undefined;
  let previousBytes = initialBytes;
  let previousTime = Date.now();
  const millisecondsPerSecond = 1_000;
  /**
   * Samples staging space without overlapping polls or racing final publication.
   * @returns {Promise<void>} Sampled state.
   */
  async function measureStaging(): Promise<void> {
    try {
      const bytes = await countStagingBytes(outputDirectory);
      ensureStorage(outputDirectory, configuration.reservedFreeBytes ?? 0);
      if (bytes > configuration.maximumFileBytes * ENGINE_LIMIT.stagingSpaceMultiplier) {
        controller.abort(new Error('The download exceeded its staging-space limit.'));
      }
      if (isGallerySource(job.sourceType)) {
        const elapsedSeconds = Math.max(1, Date.now() - previousTime) / millisecondsPerSecond;
        job.bytesPerSecond = Math.max(0, bytes - previousBytes) / elapsedSeconds;
        job.receivedBytes = bytes;
        previousBytes = bytes;
        previousTime = Date.now();
        if (deviantartProgress) {
          deviantartProgress.sample(bytes);
        } else {
          job.stage = 'Collecting post media';
        }
      }
    } catch (error) {
      controller.abort(error);
    }
  }
  const interval = setInterval(() => {
    measurement ??= measureStaging().finally(() => {
      measurement = undefined;
    });
  }, ENGINE_LIMIT.progressIntervalMilliseconds);
  try {
    await runEngineProcess(
      execution.command,
      buildMediaArguments(
        job,
        outputDirectory,
        proxy.url,
        configuration.maximumFileBytes,
        cookies.filename,
        configuration.downloadBytesPerSecond,
        browser,
        deviantartSession,
      ),
      combinedSignal,
      (line) => {
        applyMediaProgress(job, line);
        deviantartProgress?.output(line, outputDirectory);
      },
      {
        env: execution.environment,
        onDiagnostic: deviantartProgress?.diagnostic,
        failure: job.sourceType === SOURCE_TYPE.deviantart ? deviantartFailure : undefined,
        authenticationMessage:
          job.sourceType === SOURCE_TYPE.deviantart
            ? 'DeviantArt needs account access. Reconnect or replace the refresh token in Settings, then restart.'
            : undefined,
      },
    );
  } finally {
    clearInterval(interval);
    await measurement;
    proxy.close();
    await cookies.cleanup();
  }
  controller.signal.throwIfAborted();
}
