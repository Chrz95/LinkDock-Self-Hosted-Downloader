import type { DownloadJob } from '../../shared/contracts.js';
import { DOWNLOAD_STATUS } from '../../shared/contracts.js';
import { DOWNLOAD_RETRY } from '../../shared/downloadRetry.js';
import { SOURCE_TYPE } from '../../shared/sources.js';
import { MEDIA_FAILURE } from '../../shared/mediaFailures.js';
import { EngineProcessError } from '../engines/failures.js';
export { sourceRetryAfter } from './retryAfter.js';

const TEMPORARY_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ERR_STREAM_PREMATURE_CLOSE',
]);
const HTTP_TRANSIENT = { timeout: 408, rate: 429, server: 500, gateway: 502, unavailable: 503, gatewayTimeout: 504 };

/** Carries only an application-authored category and parsed timing, never a response header or body. */
export class SourceRetryError extends EngineProcessError {
  /** Records a recognized HTTP retry condition from the guarded direct-file transport.
   * @param {number} status - Known temporary HTTP status.
   * @param {number | null | undefined} retryAfterAt - Absolute deadline, absent header or invalid header.
   */
  constructor(
    readonly status: number,
    readonly retryAfterAt: number | null | undefined,
  ) {
    super(
      status === HTTP_TRANSIENT.rate ? MEDIA_FAILURE.rate : MEDIA_FAILURE.network,
      `The source returned temporary HTTP ${status}.`,
    );
  }
}
/** Recognizes only HTTP statuses for which a queued direct retry is meaningful.
 * @param {number} status - Upstream HTTP status.
 * @returns {boolean} Whether the queue may inspect this transient response.
 */
export function transientHttpStatus(status: number): boolean {
  return Object.values(HTTP_TRANSIENT).includes(status);
}
/** Uses fixed error types/codes; access failures, DNS policy rejections and filesystem errors never auto-retry.
 * @param {DownloadJob} job - Source, publication state and attempt budget.
 * @param {unknown} error - Worker failure, never copied into retry metadata.
 * @returns {boolean} Whether a bounded automatic retry is eligible.
 */
export function canAutomaticallyRetry(job: DownloadJob, error: unknown): boolean {
  if (
    job.payloadReady ||
    job.sourceType === SOURCE_TYPE.torrent ||
    job.sourceType === SOURCE_TYPE.magnet ||
    (job.retry?.attempts ?? 0) >= DOWNLOAD_RETRY.maximumAttempts
  ) {
    return false;
  }
  if (error instanceof SourceRetryError) {
    return error.retryAfterAt !== null;
  }
  if (error instanceof EngineProcessError) {
    return error.reason === MEDIA_FAILURE.network && !error.message.includes('MEDIA-DNS-NONPUBLIC');
  }
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && TEMPORARY_CODES.has(error.code);
}
/** Groups known source aliases while avoiding arbitrary suffix matching between unrelated hosts.
 * @param {DownloadJob} job - Validated existing source URL.
 * @returns {string | null} Host cooldown key, or no peer-to-peer/source scope.
 */
export function retrySource(job: DownloadJob): string | null {
  if (job.sourceType === SOURCE_TYPE.torrent || job.sourceType === SOURCE_TYPE.magnet) {
    return null;
  }
  try {
    const host = new URL(job.url).hostname;
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) {
      return 'youtube.com';
    }
    return host;
  } catch {
    return null;
  }
}
/** Collects durable host cooldowns, including cancelled/paused records until their requested wait expires.
 * @param {DownloadJob[]} jobs - Current validated history.
 * @returns {Map<string, number>} Latest permitted retry time for each affected host.
 */
export function sourceCooldowns(jobs: DownloadJob[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const job of jobs) {
    const source = retrySource(job);
    const until = job.retry ? Date.parse(job.retry.cooldownUntil) : 0;
    if (source && until > Date.now()) {
      result.set(source, Math.max(result.get(source) ?? 0, until));
    }
  }
  return result;
}
/** Records retry timing before the worker releases its slot; final failures receive no automatic notification loop.
 * @param {DownloadJob} job - Failed worker still in downloading state.
 * @param {unknown} error - Recognized transient failure or rate-limit response.
 * @param {boolean} enabled - Owner automatic retry preference.
 * @returns {boolean} Whether the job is now queued for a later automatic attempt.
 */
export function scheduleAutomaticRetry(job: DownloadJob, error: unknown, enabled: boolean): boolean {
  if (job.payloadReady || job.sourceType === SOURCE_TYPE.torrent || job.sourceType === SOURCE_TYPE.magnet) {
    return false;
  }
  const eligible = enabled && canAutomaticallyRetry(job, error);
  const rate = error instanceof EngineProcessError && error.reason === MEDIA_FAILURE.rate;
  const temporary = canAutomaticallyRetry({ ...job, retry: undefined }, error);
  if (!eligible && !rate && !temporary && !(error instanceof SourceRetryError)) {
    return false;
  }
  const attempts = job.retry?.attempts ?? 0;
  const delay = rate
    ? DOWNLOAD_RETRY.rateDelaysMilliseconds[Math.min(attempts, DOWNLOAD_RETRY.maximumAttempts - 1)]!
    : DOWNLOAD_RETRY.delaysMilliseconds[Math.min(attempts, DOWNLOAD_RETRY.maximumAttempts - 1)]!;
  const until = Math.max(
    Date.now() + delay,
    job.retry ? Date.parse(job.retry.cooldownUntil) : 0,
    error instanceof SourceRetryError ? (error.retryAfterAt ?? 0) : 0,
  );
  job.retry = {
    attempts: eligible ? attempts + 1 : attempts,
    reason: rate ? 'rate' : 'network',
    nextAttemptAt: eligible ? new Date(until).toISOString() : null,
    cooldownUntil: new Date(until).toISOString(),
  };
  if (eligible) {
    job.status = DOWNLOAD_STATUS.queued;
    job.errorMessage = null;
    job.mediaFailure = undefined;
    job.stage = 'Waiting for automatic retry';
  }
  return eligible;
}
/** Explicit restart resets the attempt budget while preserving any still-active provider cooldown.
 * @param {DownloadJob} job - Owner-selected terminal or paused record.
 */
export function resetAutomaticRetry(job: DownloadJob): void {
  job.retry =
    job.retry && Date.parse(job.retry.cooldownUntil) > Date.now()
      ? { ...job.retry, attempts: 0, nextAttemptAt: null }
      : undefined;
}

/** Stops previously scheduled automatic attempts when the owner disables retries, including at startup.
 * @param {DownloadJob[]} jobs - Current validated queue records.
 * @param {boolean} enabled - Current durable owner preference.
 * @returns {boolean} Whether any pending automatic attempts were paused.
 */
export function holdDisabledRetries(jobs: DownloadJob[], enabled: boolean): boolean {
  let changed = false;
  if (!enabled) {
    for (const job of jobs) {
      if (job.status === DOWNLOAD_STATUS.queued && job.retry?.nextAttemptAt && job.retry.attempts > 0) {
        job.status = DOWNLOAD_STATUS.paused;
        job.retry.nextAttemptAt = null;
        job.stage = 'Automatic retries disabled. Resume manually when ready.';
        changed = true;
      }
    }
  }
  return changed;
}
