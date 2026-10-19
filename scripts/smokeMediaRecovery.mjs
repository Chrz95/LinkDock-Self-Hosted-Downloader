import assert from 'node:assert/strict';
import { runEngineProcess } from '../dist-server/server/engines/runProcess.js';
import { EngineProcessError } from '../dist-server/server/engines/failures.js';
import { MEDIA_FAILURE } from '../dist-server/shared/mediaFailures.js';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../dist-server/shared/contracts.js';
import { AUDIO_QUALITY, VIDEO_QUALITY } from '../dist-server/shared/sources.js';
import { JOB_OPTIONS } from '../dist-server/shared/jobOptions.js';

/**
 * Exercises compiled safe process diagnostics and an independent quality/MP3 copy through the owner API.
 * @param {object} queue - Stopped production queue.
 * @param {object} client - Authenticated owner agent.
 * @returns {Promise<void>} Native process and additional-version boundaries verified.
 */
export async function smokeMediaRecovery(queue, client) {
  const failure = await runEngineProcess(
    process.execPath,
    ['-e', "process.stderr.write('Requested format is not available token=fixture-secret'); process.exit(1)"],
    new AbortController().signal,
    () => {},
  ).catch((error) => error);
  assert.ok(failure instanceof EngineProcessError);
  assert.equal(failure.reason, MEDIA_FAILURE.format);
  assert.ok(!String(failure).includes('fixture-secret'));
  const original = queue.add('https://youtu.be/compiled-media-copy', 'video', VIDEO_QUALITY.compact);
  original.status = DOWNLOAD_STATUS.failed;
  original.mediaFailure = failure.reason;
  original.errorMessage = failure.message;
  queue.store.save();
  const added = await client
    .post(`${API_PATH.downloads}/${original.id}${JOB_OPTIONS.mediaCopy}`)
    .send({ quality: AUDIO_QUALITY.high })
    .expect(HTTP_STATUS.created);
  const copy = queue.store.jobs.find((job) => job.id === added.body.id);
  assert.equal(copy.url, original.url);
  assert.equal(copy.quality, AUDIO_QUALITY.high);
  assert.equal(copy.mediaFailure, undefined);
  assert.equal(original.status, DOWNLOAD_STATUS.failed);
  assert.equal(original.quality, VIDEO_QUALITY.compact);
  const result = await client.get(API_PATH.downloads).expect(HTTP_STATUS.ok);
  assert.equal(result.body.jobs.find((job) => job.id === original.id).mediaFailure, MEDIA_FAILURE.format);
  for (const job of [copy, original]) {
    if (job.status === DOWNLOAD_STATUS.queued) {
      queue.cancel(job);
    }
    queue.remove(job);
  }
  process.stdout.write('Compiled safe engine diagnostics, independent media copy and retained originals: passed.\n');
}
