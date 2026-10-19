import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DEVIANTART, DEVIANTART_ACTION } from '../dist-server/shared/deviantart.js';
import { DEVIANTART_OAUTH } from '../dist-server/shared/deviantartOAuth.js';
import { HTTP_STATUS } from '../dist-server/shared/contracts.js';
import { DeviantartStore } from '../dist-server/server/deviantart/store.js';
import { createDeviantartProgress } from '../dist-server/server/deviantart/progress.js';
import { runEngineProcess } from '../dist-server/server/engines/runProcess.js';
import { MEDIA_FAILURE } from '../dist-server/shared/mediaFailures.js';

/**
 * Verifies compiled PKCE authorization, private token exchange and a real stalled-worker interruption offline.
 * @param {object} configuration - Temporary production station.
 * @param {object} client - Authenticated owner HTTP client.
 * @returns {Promise<void>} Native authorization and bounded failure recovery verified with a local provider fixture.
 */
export async function smokeDeviantartOAuth(configuration, client) {
  const app = { clientId: '123456', clientSecret: 'compiled-app-secret' };
  await client.post(`${DEVIANTART_OAUTH.path}/setup`).send(app).expect(HTTP_STATUS.ok);
  const start = await client.post(`${DEVIANTART_OAUTH.path}/start`).send({}).expect(HTTP_STATUS.ok);
  const url = new URL(start.body.authorizationUrl);
  assert.equal(url.origin, 'https://www.deviantart.com');
  assert.equal(url.searchParams.get('scope'), 'browse');
  assert.equal(url.searchParams.has('client_secret'), false);
  const [cookie] = start.headers['set-cookie'][0].split(';');
  const originalFetch = globalThis.fetch;
  let exchanges = 0;
  try {
    globalThis.fetch = async (endpoint, options) => {
      assert.equal(endpoint, 'https://www.deviantart.com/oauth2/token');
      assert.equal(options.redirect, 'error');
      assert.equal(options.body.get('redirect_uri'), url.searchParams.get('redirect_uri'));
      assert.equal(
        createHash('sha256').update(options.body.get('code_verifier')).digest('base64url'),
        url.searchParams.get('code_challenge'),
      );
      exchanges += 1;
      return new Response(
        JSON.stringify({ access_token: 'temporary-access', refresh_token: 'compiled-refresh-token' }),
      );
    };
    const result = await client
      .get(DEVIANTART_OAUTH.callback)
      .set('Cookie', cookie)
      .query({ state: url.searchParams.get('state'), code: 'compiled-code' })
      .expect(DEVIANTART_OAUTH.redirectStatus);
    assert.equal(result.headers.location, '/?deviantart=connected#settings');
    assert.equal(
      new DeviantartStore(configuration.dataDirectory).read().account.refreshToken,
      'compiled-refresh-token',
    );
    const metadata = await client.get(DEVIANTART.path).expect(HTTP_STATUS.ok);
    assert.equal(metadata.body.hasAccount, true);
    assert.ok(!JSON.stringify(metadata.body).includes('compiled-refresh-token'));
    const replay = await client
      .get(DEVIANTART_OAUTH.callback)
      .set('Cookie', cookie)
      .query({ state: url.searchParams.get('state'), code: 'compiled-code' });
    assert.equal(replay.headers.location, '/?deviantart=expired#settings');
    assert.equal(exchanges, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await client.post(DEVIANTART.path).send({ action: DEVIANTART_ACTION.clear }).expect(HTTP_STATUS.ok);
  }
  const controller = new AbortController();
  const progress = createDeviantartProgress({}, controller, 0);
  await assert.rejects(
    runEngineProcess(
      process.execPath,
      ['-e', "process.stderr.write('API responded with 429 Too Many Requests\\n'); setInterval(()=>{},1000)"],
      controller.signal,
      () => {},
      { onDiagnostic: progress.diagnostic },
    ),
    (error) => error.reason === MEDIA_FAILURE.rate,
  );
  process.stdout.write(
    'Compiled DeviantArt PKCE, private token exchange, replay rejection and rate-loop recovery: passed.\n',
  );
}
