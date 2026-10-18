import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_TYPE } from '../../shared/sources.js';
import type { DownloadJob } from '../../shared/contracts.js';
import type { ServerConfig } from '../config.js';
import { ENGINE_COMMAND, ENGINE_LIMIT, MEDIA_LINE } from './constants.js';
import { buildMediaArguments } from './mediaArguments.js';
import { createPublicProxy } from './publicProxy.js';
import { runEngineProcess } from './runProcess.js';
import { prepareMediaCookies } from './cookies.js';
import { ensureStorage } from '../policy/storage.js';

/**
 * Counts staging bytes, including temporary merge files, without following symlinks.
 * @param {string} directory - Isolated worker directory.
 * @returns {Promise<number>} Current bytes present on disk.
 */
export async function countStagingBytes(directory: string): Promise<number> {
  let totalBytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error('Symbolic links are not allowed in output.');
    }
    const filename = path.join(directory, entry.name);
    try {
      totalBytes += entry.isDirectory() ? await countStagingBytes(filename) : (await stat(filename)).size;
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
 * Downloads one site video or Instagram post through checked public egress and a bounded worker.
 * @param {DownloadJob} job - Site request.
 * @param {string} outputDirectory - Isolated staging location.
 * @param {AbortSignal} signal - Queue cancellation.
 * @param {ServerConfig} configuration - Limits and optional authentication cookie jar.
 * @returns {Promise<void>} Complete staged output.
 */
export async function downloadMedia(
  job: DownloadJob,
  outputDirectory: string,
  signal: AbortSignal,
  configuration: ServerConfig,
): Promise<void> {
  const initialBytes = await countStagingBytes(outputDirectory);
  ensureStorage(outputDirectory, configuration.reservedFreeBytes ?? 0);
  const cookies = await prepareMediaCookies(configuration.dataDirectory, configuration.mediaCookiesFile);
  const proxy = await createPublicProxy().catch(async (error: unknown) => {
    await cookies.cleanup();
    throw error;
  });
  const controller = new AbortController();
  const combinedSignal = AbortSignal.any([signal, controller.signal]);
  const command = job.sourceType === SOURCE_TYPE.instagram ? ENGINE_COMMAND.instagram : ENGINE_COMMAND.video;
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
      if (job.sourceType === SOURCE_TYPE.instagram) {
        const elapsedSeconds = Math.max(1, Date.now() - previousTime) / millisecondsPerSecond;
        job.bytesPerSecond = Math.max(0, bytes - previousBytes) / elapsedSeconds;
        job.receivedBytes = bytes;
        previousBytes = bytes;
        previousTime = Date.now();
        job.stage = 'Collecting post media';
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
      command,
      buildMediaArguments(
        job,
        outputDirectory,
        proxy.url,
        configuration.maximumFileBytes,
        cookies.filename,
        configuration.downloadBytesPerSecond,
      ),
      combinedSignal,
      (line) => applyMediaProgress(job, line),
    );
  } finally {
    clearInterval(interval);
    await measurement;
    proxy.close();
    await cookies.cleanup();
  }
  controller.signal.throwIfAborted();
}
