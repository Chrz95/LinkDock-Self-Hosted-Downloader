const BACKOFF = { first: 30_000, second: 120_000, third: 300_000, rateSecond: 600_000, rateThird: 1_200_000 } as const;
/** Queue retries release worker slots; engine-internal retries remain independently bounded. */
export const DOWNLOAD_RETRY = {
  delaysMilliseconds: [BACKOFF.first, BACKOFF.second, BACKOFF.third],
  rateDelaysMilliseconds: [BACKOFF.third, BACKOFF.rateSecond, BACKOFF.rateThird],
  maximumAttempts: 3,
  maximumHeaderCharacters: 128,
  maximumTimestampCharacters: 32,
  millisecondsPerSecond: 1_000,
} as const;
export interface DownloadRetry {
  attempts: number;
  nextAttemptAt: string | null;
  cooldownUntil: string;
  reason: 'network' | 'rate';
}
/** Refuses malformed durable retry state before the scheduler consumes it.
 * @param {unknown} value - Optional saved retry record.
 * @returns {boolean} Whether all fields are bounded and recognized.
 */
export function validDownloadRetry(value: unknown): value is DownloadRetry | undefined {
  if (value === undefined) {
    return true;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const entry = value as DownloadRetry;
  return (
    Object.keys(entry).every((key) => ['attempts', 'nextAttemptAt', 'cooldownUntil', 'reason'].includes(key)) &&
    Number.isSafeInteger(entry.attempts) &&
    entry.attempts >= 0 &&
    entry.attempts <= DOWNLOAD_RETRY.maximumAttempts &&
    (entry.reason === 'network' || entry.reason === 'rate') &&
    typeof entry.cooldownUntil === 'string' &&
    entry.cooldownUntil.length <= DOWNLOAD_RETRY.maximumTimestampCharacters &&
    Number.isFinite(Date.parse(entry.cooldownUntil)) &&
    (entry.nextAttemptAt === null ||
      (typeof entry.nextAttemptAt === 'string' &&
        entry.nextAttemptAt.length <= DOWNLOAD_RETRY.maximumTimestampCharacters &&
        Number.isFinite(Date.parse(entry.nextAttemptAt)) &&
        entry.attempts > 0 &&
        Date.parse(entry.nextAttemptAt) <= Date.parse(entry.cooldownUntil)))
  );
}
