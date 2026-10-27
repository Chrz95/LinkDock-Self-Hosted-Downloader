import assert from 'node:assert/strict';
import { DownloadStore } from '../dist-server/server/downloads/store.js';
import {
  SourceRetryError,
  scheduleAutomaticRetry,
  sourceCooldowns,
  holdDisabledRetries,
} from '../dist-server/server/downloads/retry.js';
import { DOWNLOAD_STATUS } from '../dist-server/shared/contracts.js';

/** Verifies compiled retry timing, durable history and disabled-preference recovery without source requests.
 * @param {DownloadQueue} queue - Stopped production fixture queue.
 * @param {object} configuration - Private fixture storage configuration.
 */
export function smokeAutomaticRetries(queue, configuration) {
  const unavailable = 503;
  const waitMilliseconds = 600_000;
  const job = queue.add('https://retry.example/compiled-state');
  job.status = DOWNLOAD_STATUS.downloading;
  const deadline = Date.now() + waitMilliseconds;
  assert.equal(scheduleAutomaticRetry(job, new SourceRetryError(unavailable, deadline), true), true);
  queue.store.save();
  const restored = new DownloadStore(configuration.dataDirectory);
  const saved = restored.jobs.find((entry) => entry.id === job.id);
  assert.equal(saved.status, DOWNLOAD_STATUS.queued);
  assert.equal(saved.retry.attempts, 1);
  assert.equal(Date.parse(saved.retry.nextAttemptAt), deadline);
  assert.equal(sourceCooldowns(restored.jobs).get('retry.example'), deadline);
  assert.equal(holdDisabledRetries(restored.jobs, false), true);
  assert.equal(saved.status, DOWNLOAD_STATUS.paused);
  assert.equal(saved.retry.nextAttemptAt, null);
  process.stdout.write('Compiled automatic retry deadlines, persistent state and disabled-preference hold: passed.\n');
}
