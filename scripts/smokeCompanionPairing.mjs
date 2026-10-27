import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import request from 'supertest';
import { COMPANION } from '../dist-server/shared/companion.js';
import { HTTP_STATUS } from '../dist-server/shared/contracts.js';

/** Exercises shipped extension fetch code against the compiled station with no signed-in tab or session cookies.
 * @param {object} application - Real compiled Express app.
 * @param {object} client - Owner-authorized management client.
 * @param {DownloadQueue} queue - Stopped smoke queue.
 * @returns {Promise<void>} Paired queue access, restricted authority and self-revocation verified.
 */
export async function smokeCompanionPairing(application, client, queue) {
  const extensionLength = 32;
  const extensionOrigin = `chrome-extension://${'a'.repeat(extensionLength)}`;
  const pairing = await client.post(COMPANION.path).send({ extensionOrigin }).expect(HTTP_STATUS.created);
  const source = ['transfer.js', 'station.js', 'download.js', 'paired.js']
    .map((name) => readFileSync(`browser-connector/${name}`, 'utf8'))
    .join('\n');
  const api = runInNewContext(`${source}; LinkDockCompanion`, {
    URL,
    AbortSignal,
    chrome: { runtime: { getURL: () => `${extensionOrigin}/` }, permissions: { contains: async () => true } },
    fetch: async (url, options) => {
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      const target = new URL(url);
      assert.equal(target.origin, 'https://station.example');
      const operation = options.method === 'POST' ? 'post' : 'delete';
      let outgoing = request(application)[operation](target.pathname).set(options.headers);
      if (options.body) {
        outgoing = outgoing.send(JSON.parse(options.body));
      }
      const response = await outgoing;
      return { status: response.status };
    },
  });
  const station = { origin: 'https://station.example', token: pairing.body.token };
  const payload = api.downloadRequest('https://www.youtube.com/watch?v=companion-smoke', 'video', 'mp3-192');
  assert.equal((await api.pairedRequest(station, 'downloads', payload)).ok, true);
  assert.ok(queue.store.jobs.some((job) => job.url === payload.url && job.quality === 'mp3-192'));
  await request(application)
    .get('/api/downloads')
    .auth(pairing.body.token, { type: 'bearer' })
    .expect(HTTP_STATUS.unauthorized);
  assert.equal((await api.pairedRequest(station, 'connection')).ok, true);
  assert.equal((await api.pairedRequest(station, 'downloads', payload)).ok, false);
  process.stdout.write('Compiled companion pairing, standalone extension submission and revocation: passed.\n');
}
