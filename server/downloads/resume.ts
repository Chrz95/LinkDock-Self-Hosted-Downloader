import { existsSync, statSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import type { DownloadJob } from '../../shared/contracts.js';
import { openSource } from './openSource.js';
import { parseTargetUrl } from '../security/target.js';

/** Only strong, bounded ASCII entity tags are used as HTTP resume validators. */
export const STRONG_ETAG = /^"[\x21\x23-\x7e]*"$/;
/** Prevents an upstream header from inflating persistent history or later request headers. */
export const MAXIMUM_ETAG_LENGTH = 1_024;
/** HTTP statuses significant to safe single-range resumption. */
const RANGE_STATUS = { partial: 206, complete: 200 } as const;

/**
 * Obtains a safe full response or a validated continuation of a persisted partial file.
 * @param {DownloadJob} job - Transfer and previously persisted entity validator.
 * @param {string} partialPath - Internal UUID-addressed partial file.
 * @param {AbortSignal} signal - Worker cancellation.
 * @returns {Promise<object>} Stream, append offset and complete representation length.
 */
export async function openResumableSource(
  job: DownloadJob,
  partialPath: string,
  signal: AbortSignal,
): Promise<{ response: IncomingMessage; offset: number; totalBytes: number | null }> {
  const partialBytes = existsSync(partialPath) ? statSync(partialPath).size : 0;
  let offset = job.resumeValidator && job.resumeSourceUrl ? partialBytes : 0;
  const headers: Record<string, string> = offset ? { Range: `bytes=${offset}-`, 'If-Range': job.resumeValidator! } : {};
  let response = await openSource(parseTargetUrl(job.url), signal, 0, headers);
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(response.headers['content-range']));
  const total = range ? Number(range[3]) : null;
  const canAppend = Boolean(
    offset &&
    response.statusCode === RANGE_STATUS.partial &&
    range &&
    Number(range[1]) === offset &&
    Number(range[2]) === total! - 1 &&
    Number.isSafeInteger(total) &&
    total! > offset &&
    (job.totalBytes === null || job.totalBytes === total) &&
    response.headers.etag === job.resumeValidator &&
    response.sourceUrl === job.resumeSourceUrl,
  );
  if (offset && !canAppend && response.statusCode !== RANGE_STATUS.complete) {
    response.destroy();
    response = await openSource(parseTargetUrl(job.url), signal);
  }
  if (!canAppend) {
    offset = 0;
    if (response.statusCode === RANGE_STATUS.partial) {
      response.destroy();
      throw new Error('The source returned an unexpected partial response. Restart this download.');
    }
  }
  if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
    response.destroy();
    throw new Error('Encoded source responses cannot be safely stored or resumed.');
  }
  const length = Number(response.headers['content-length']);
  const totalBytes = canAppend ? total : Number.isSafeInteger(length) && length >= 0 ? length : null;
  if (canAppend && Number.isFinite(length) && length !== total! - offset) {
    response.destroy();
    throw new Error('The resumed response length does not match its byte range.');
  }
  const validator = response.headers.etag;
  job.resumeSourceUrl = response.sourceUrl;
  job.stage = offset
    ? 'Resuming saved progress'
    : partialBytes
      ? 'Source restarted from the beginning'
      : 'Downloading file';
  job.resumeValidator =
    typeof validator === 'string' && validator.length <= MAXIMUM_ETAG_LENGTH && STRONG_ETAG.test(validator)
      ? validator
      : undefined;
  return { response, offset, totalBytes };
}
