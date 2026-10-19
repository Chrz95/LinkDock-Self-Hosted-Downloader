import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DEVIANTART, DEVIANTART_ACTION } from '../dist-server/shared/deviantart.js';
import { HTTP_STATUS } from '../dist-server/shared/contracts.js';
import { prepareDeviantartSession } from '../dist-server/server/deviantart/session.js';
import { tryDeviantartLock } from '../dist-server/server/deviantart/lock.js';

/**
 * Checks compiled source setup, private config/cache persistence and locked account removal without a remote login.
 * @param {object} configuration - Temporary production station.
 * @param {object} client - Authenticated same-origin owner client.
 * @returns {Promise<void>} Native private-account boundaries verified.
 */
export async function smokeDeviantart(configuration, client) {
  const account = await client
    .post(DEVIANTART.path)
    .send({
      action: DEVIANTART_ACTION.account,
      refreshToken: 'compiled-fixture-token',
    })
    .expect(HTTP_STATUS.ok);
  assert.equal(account.body.hasAccount, true);
  assert.ok(!JSON.stringify(account.body).includes('compiled-fixture-token'));
  await client
    .post(DEVIANTART.path)
    .send({
      action: DEVIANTART_ACTION.preferences,
      include: ['gallery', 'journal', 'scraps'],
      original: true,
      stories: 'text',
    })
    .expect(HTTP_STATUS.ok);
  const session = await prepareDeviantartSession(configuration.dataDirectory);
  assert.equal(JSON.parse(readFileSync(session.configFile, 'utf8')).extractor.deviantart.public, false);
  await session.cleanup();
  assert.equal(existsSync(session.configFile), false);
  const second = await prepareDeviantartSession(configuration.dataDirectory);
  assert.equal(second.cacheFile, session.cacheFile);
  await second.cleanup();
  const release = tryDeviantartLock(configuration.dataDirectory);
  assert.ok(release);
  try {
    await client.post(DEVIANTART.path).send({ action: DEVIANTART_ACTION.clear }).expect(HTTP_STATUS.conflict);
  } finally {
    release();
  }
  const removed = await client.post(DEVIANTART.path).send({ action: DEVIANTART_ACTION.clear }).expect(HTTP_STATUS.ok);
  assert.equal(removed.body.hasAccount, false);
  assert.deepEqual(removed.body.include, ['gallery', 'journal', 'scraps']);
  assert.equal(existsSync(session.cacheFile), false);
  process.stdout.write('Compiled DeviantArt setup, private cache persistence, account locking and removal: passed.\n');
}
