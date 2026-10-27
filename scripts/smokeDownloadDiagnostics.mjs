import assert from 'node:assert/strict';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../dist-server/shared/contracts.js';
import { DIAGNOSTICS } from '../dist-server/shared/diagnostics.js';

/** Verifies the compiled report route against real private-address rejection, without contacting a provider.
 * @param {DownloadQueue} queue - Stopped production fixture queue.
 * @param {object} client - Signed-in same-origin test client.
 * @returns {Promise<void>} Compiled route and secret-exclusion assertions.
 */
export async function smokeDownloadDiagnostics(queue, client) {
  const job = queue.add('http://127.0.0.1/diagnostic?private=diagnostic-secret');
  job.status = DOWNLOAD_STATUS.failed;
  const original = JSON.stringify(job);
  const response = await client
    .post(`${API_PATH.downloads}/${job.id}${DIAGNOSTICS.path}`)
    .send({})
    .expect(HTTP_STATUS.ok);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.diagnostic, 'LD-DOWNLOAD-1');
  assert.equal(response.body.dnsMode, 'system');
  assert.ok(response.body.checks.some((check) => check.id === 'dns' && check.state === 'failed'));
  assert.doesNotMatch(response.text, /127\.0\.0\.1|diagnostic-secret|downloads\//);
  assert.equal(JSON.stringify(job), original);
  process.stdout.write('Compiled download diagnostics, private DNS rejection and safe report export: passed.\n');
}
