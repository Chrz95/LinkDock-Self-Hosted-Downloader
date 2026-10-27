import { expect, it, vi } from 'vitest';
import {
  SourceRetryError,
  canAutomaticallyRetry,
  scheduleAutomaticRetry,
  sourceRetryAfter,
  sourceCooldowns,
  resetAutomaticRetry,
} from '../server/downloads/retry';
import { EngineProcessError } from '../server/engines/failures';
import { NonPublicTargetError } from '../server/security/target';
import { MEDIA_FAILURE } from '../shared/mediaFailures';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { SOURCE_TYPE } from '../shared/sources';
import { validDownloadRetry, DOWNLOAD_RETRY } from '../shared/downloadRetry';
import { validatePolicy } from '../server/policy/settings';
import { DEFAULT_POLICY } from '../shared/policy';

const job: DownloadJob = {
  id: 'fixture',
  url: 'https://source.example/item',
  filename: 'item',
  status: DOWNLOAD_STATUS.downloading,
  sourceType: SOURCE_TYPE.direct,
  receivedBytes: 0,
  totalBytes: null,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: null,
  errorMessage: null,
};
const HTTP_RATE = 429;
const HTTP_UNAVAILABLE = 503;

it.each([
  new EngineProcessError(MEDIA_FAILURE.login),
  new EngineProcessError(MEDIA_FAILURE.verification),
  new EngineProcessError(MEDIA_FAILURE.access),
  new EngineProcessError(MEDIA_FAILURE.drm),
  new EngineProcessError(MEDIA_FAILURE.utility),
  new EngineProcessError(MEDIA_FAILURE.rate),
  new EngineProcessError(MEDIA_FAILURE.network, 'DNS policy rejected. (MEDIA-DNS-NONPUBLIC)'),
  new NonPublicTargetError(),
  Object.assign(new Error('private path'), { code: 'EACCES' }),
  Object.assign(new Error('bad certificate'), { code: 'CERT_HAS_EXPIRED' }),
  new Error('unclassified connection problem'),
])('does not automatically repeat non-transient or ambiguous failure %s', (error) => {
  expect(canAutomaticallyRetry(job, error)).toBe(false);
});

it('recognizes bounded network failures but excludes torrents and already-published payloads', () => {
  const error = new EngineProcessError(MEDIA_FAILURE.network);
  expect(canAutomaticallyRetry(job, error)).toBe(true);
  expect(canAutomaticallyRetry({ ...job, sourceType: SOURCE_TYPE.magnet }, error)).toBe(false);
  expect(canAutomaticallyRetry({ ...job, payloadReady: true }, error)).toBe(false);
});

it('honors long seconds/date Retry-After values and refuses invalid values instead of shortening them', () => {
  const now = Date.parse('2026-10-27T10:00:00Z');
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const longSeconds = 86_400;
  const requested = now + longSeconds * DOWNLOAD_RETRY.millisecondsPerSecond;
  expect(sourceRetryAfter(String(longSeconds))).toBe(requested);
  expect(sourceRetryAfter(new Date(requested).toUTCString())).toBe(requested);
  expect(sourceRetryAfter('private-invalid-header')).toBeNull();
  expect(sourceRetryAfter('-1')).toBeNull();
  expect(sourceRetryAfter('1.5')).toBeNull();
  expect(sourceRetryAfter('Wed, 28 Oct 2026 10:00:00 GMT')).toBe(requested);
  expect(sourceRetryAfter('Wednesday, 28-Oct-26 10:00:00 GMT')).toBe(requested);
  expect(sourceRetryAfter('Wed Oct 28 10:00:00 2026')).toBe(requested);
  expect(sourceRetryAfter('9'.repeat(DOWNLOAD_RETRY.maximumHeaderCharacters))).toBeNull();
  expect(sourceRetryAfter(undefined)).toBeUndefined();
  const current = { ...job };
  expect(scheduleAutomaticRetry(current, new SourceRetryError(HTTP_RATE, requested), true)).toBe(true);
  expect(Date.parse(current.retry!.nextAttemptAt!)).toBe(requested);
  expect(canAutomaticallyRetry(job, new SourceRetryError(HTTP_UNAVAILABLE, null))).toBe(false);
});

it('retains a rate-limit cooldown even when automatic retries require manual review or have been disabled', () => {
  const current = { ...job, sourceType: SOURCE_TYPE.video };
  expect(scheduleAutomaticRetry(current, new EngineProcessError(MEDIA_FAILURE.rate), true)).toBe(false);
  expect(current.status).toBe(DOWNLOAD_STATUS.downloading);
  expect(current.retry).toMatchObject({ attempts: 0, nextAttemptAt: null, reason: 'rate' });
  expect(sourceCooldowns([current]).get('source.example')).toBe(Date.parse(current.retry!.cooldownUntil));
  resetAutomaticRetry(current);
  expect(current.retry?.cooldownUntil).toBeTruthy();
  const disabled = { ...job };
  expect(scheduleAutomaticRetry(disabled, new SourceRetryError(HTTP_RATE, undefined), false)).toBe(false);
  expect(disabled.retry?.nextAttemptAt).toBeNull();
});

it('rejects invalid retry state and migrates old preferences without accepting a malformed retry toggle', () => {
  const future = '2026-10-27T10:00:00Z';
  expect(validDownloadRetry(undefined)).toBe(true);
  expect(validDownloadRetry({ attempts: 1, nextAttemptAt: future, cooldownUntil: future, reason: 'network' })).toBe(
    true,
  );
  expect(
    validDownloadRetry({
      attempts: DOWNLOAD_RETRY.maximumAttempts + 1,
      nextAttemptAt: future,
      cooldownUntil: future,
      reason: 'network',
    }),
  ).toBe(false);
  expect(validDownloadRetry({ attempts: 0, nextAttemptAt: future, cooldownUntil: future, reason: 'network' })).toBe(
    false,
  );
  expect(validDownloadRetry({ attempts: 1, nextAttemptAt: 'invalid', cooldownUntil: future, reason: 'network' })).toBe(
    false,
  );
  const legacy = { ...DEFAULT_POLICY };
  delete legacy.automaticRetries;
  expect(validatePolicy(legacy).automaticRetries).toBe(true);
  expect(() => validatePolicy({ ...DEFAULT_POLICY, automaticRetries: 'yes' })).toThrow('Automatic retries');
});
