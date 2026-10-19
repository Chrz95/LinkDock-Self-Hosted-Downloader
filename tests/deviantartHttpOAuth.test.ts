import { createHash } from 'node:crypto';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { createApplication } from '../server/app';
import { afterEach, expect, it, vi } from 'vitest';
import { DEVIANTART, DEVIANTART_ACTION } from '../shared/deviantart';
import { DEVIANTART_OAUTH } from '../shared/deviantartOAuth';
import { HTTP_STATUS } from '../shared/contracts';
import { DeviantartStore } from '../server/deviantart/store';
import { tryDeviantartLock } from '../server/deviantart/lock';
import { deviantartAuthorizationAddress } from '../src/features/settings/deviantartNavigation';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';
const APP = { clientId: '123456', clientSecret: 'private-http-app-secret' };
const CODE = 'private-one-use-code';
const TOKEN = 'private-http-refresh-token';
/**
 * Starts an HTTP-only owner session with a provider HTTPS landing callback and recorded offline exchange.
 * @returns {Promise<object>} Real private API, pending transaction, callback cookies and mock provider.
 */
async function fixture() {
  const station = await createDeliveryFixture();
  station.configuration.publicOrigin = 'http://pi.example:7489';
  await station.login();
  await station.client.post(`${DEVIANTART_OAUTH.path}/setup`).send(APP).expect(HTTP_STATUS.ok);
  const started = await station.client.post(`${DEVIANTART_OAUTH.path}/start`).send({}).expect(HTTP_STATUS.ok);
  const authorization = new URL(started.body.authorizationUrl);
  const state = authorization.searchParams.get('state')!;
  const [cookie] = started.headers['set-cookie']![0]!.split(';');
  const fetch = vi.fn(async () => new Response(JSON.stringify({ access_token: 'ephemeral', refresh_token: TOKEN })));
  vi.stubGlobal('fetch', fetch);
  /**
   * Builds an offline authorization response at an allowed callback destination.
   * @param {string} [destination] - HTTPS landing page or its exact localhost redirect.
   * @returns {string} Provider-style URL, never fetched.
   */
  function returned(destination: string = DEVIANTART_OAUTH.loopbackReturn): string {
    const url = new URL(destination);
    url.search = new URLSearchParams({ state, code: CODE }).toString();
    return url.href;
  }
  return { ...station, started, authorization, state, cookie: cookie!, fetch, returned };
}
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await cleanupDeliveryFixtures();
});

it.each([DEVIANTART_OAUTH.loopbackReturn, DEVIANTART_OAUTH.landing])(
  'connects an HTTP station by owner POST from an allowed return address: %s',
  async (destination) => {
    const { client, directory, started, authorization, fetch, returned } = await fixture();
    const metadata = await client.get(DEVIANTART_OAUTH.path).expect(HTTP_STATUS.ok);
    expect(metadata.body).toEqual({ configured: true, callbackUrl: DEVIANTART_OAUTH.landing, returnMode: 'copy' });
    expect(started.body.returnMode).toBe('copy');
    expect(deviantartAuthorizationAddress(started.body.authorizationUrl)).toBe(started.body.authorizationUrl);
    expect(authorization.searchParams.get('view')).toBe('login');
    expect(authorization.searchParams.get('redirect_uri')).toBe(DEVIANTART_OAUTH.landing);
    const result = await client
      .post(`${DEVIANTART_OAUTH.path}/complete`)
      .send({ responseUrl: returned(destination) })
      .expect(HTTP_STATUS.ok);
    expect(result.body).toEqual({ result: 'connected' });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(result.body)).not.toMatch(/private-http|private-one-use/);
    expect(new DeviantartStore(directory).read().account).toMatchObject({ ...APP, refreshToken: TOKEN });
    expect(fetch).toHaveBeenCalledOnce();
    const [endpoint, options] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(endpoint).toBe('https://www.deviantart.com/oauth2/token');
    const body = options!.body as URLSearchParams;
    expect(body.get('code')).toBe(CODE);
    expect(body.get('redirect_uri')).toBe(DEVIANTART_OAUTH.landing);
    expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(
      authorization.searchParams.get('code_challenge'),
    );
    const replay = await client.post(`${DEVIANTART_OAUTH.path}/complete`).send({ responseUrl: returned(destination) });
    expect(replay.body.result).toBe('expired');
    expect(fetch).toHaveBeenCalledOnce();
  },
);

it('requires the owner session, original browser binding and same-origin JSON for pasted responses', async () => {
  const { application, client, returned, fetch, cookie, directory } = await fixture();
  const responseUrl = returned();
  await request(application)
    .post(`${DEVIANTART_OAUTH.path}/complete`)
    .send({ responseUrl })
    .set('Cookie', cookie)
    .expect(HTTP_STATUS.unauthorized);
  await client
    .post(`${DEVIANTART_OAUTH.path}/complete`)
    .set('Origin', 'https://other.example')
    .send({ responseUrl })
    .expect(HTTP_STATUS.forbidden);
  const other = request.agent(application);
  await other.post('/api/session').send({ token: 'delivery-test-password-at-least-32-characters' });
  const wrongBrowser = await other.post(`${DEVIANTART_OAUTH.path}/complete`).send({ responseUrl });
  expect(wrongBrowser.body.result).toBe('expired');
  expect(fetch).not.toHaveBeenCalled();
  expect(new DeviantartStore(directory).snapshot().hasAccount).toBe(false);
  const correct = await client.post(`${DEVIANTART_OAUTH.path}/complete`).send({ responseUrl });
  expect(correct.body.result).toBe('connected');
});

it('pins completion to the copy transport and does not consume it through the public GET callback', async () => {
  const { client, state, returned, fetch } = await fixture();
  const wrongTransport = await client.get(DEVIANTART_OAUTH.callback).query({ state, code: CODE });
  expect(wrongTransport.headers.location).toContain('deviantart=expired');
  expect(wrongTransport.headers['set-cookie']).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
  const result = await client.post(`${DEVIANTART_OAUTH.path}/complete`).send({ responseUrl: returned() });
  expect(result.body.result).toBe('connected');
});

it.each(['https://www.deviantart.com/', 'https://deviantart.com/', 'https://www.deviantart.com/users/login'])(
  'explains a provider-page paste without consuming the valid transaction: %s',
  async (responseUrl) => {
    const { client, returned, fetch } = await fixture();
    const result = await client
      .post(`${DEVIANTART_OAUTH.path}/complete`)
      .send({ responseUrl })
      .expect(HTTP_STATUS.badRequest);
    expect(result.body).toEqual({ error: DEVIANTART_OAUTH.homepageMessage });
    expect(fetch).not.toHaveBeenCalled();
    const valid = await client.post(`${DEVIANTART_OAUTH.path}/complete`).send({ responseUrl: returned() });
    expect(valid.body.result).toBe('connected');
  },
);

it.each([
  'https://attacker.example/?code=secret&state=valid',
  'http://localhost:6415/?code=secret&state=valid',
  'http://localhost:6414/other?code=secret&state=valid',
  'https://mikf.github.io/gallery-dl/oauth-redirect.html.evil?code=secret&state=valid',
  'https://user:secret@mikf.github.io/gallery-dl/oauth-redirect.html?code=secret&state=valid',
  'http://localhost:6414/?state=valid&state=other&code=secret',
  'http://localhost:6414/?state=valid&code=secret&code=other',
  'http://localhost:6414/?state=valid&code=secret&error=access_denied',
  'http://localhost:6414/?state=valid&code=secret#fragment',
  'http://localhost:6414/?state=valid',
  'not-a-url',
  null,
])('rejects malformed or arbitrary return addresses without a request or grant loss', async (responseUrl) => {
  const { client, returned, fetch } = await fixture();
  const result = await client
    .post(`${DEVIANTART_OAUTH.path}/complete`)
    .send({ responseUrl })
    .expect(HTTP_STATUS.badRequest);
  expect(result.body).toEqual({ error: 'Paste the complete authorization response URL.' });
  expect(fetch).not.toHaveBeenCalled();
  const valid = await client.post(`${DEVIANTART_OAUTH.path}/complete`).send({ responseUrl: returned() });
  expect(valid.body.result).toBe('connected');
});

it('rejects oversized return fields and swapped states without exposing their contents', async () => {
  const { client, returned, fetch } = await fixture();
  await client
    .post(`${DEVIANTART_OAUTH.path}/complete`)
    .send({ responseUrl: 'x'.repeat(DEVIANTART_OAUTH.maximumReturnCharacters + 1) })
    .expect(HTTP_STATUS.badRequest);
  const url = new URL(returned());
  url.searchParams.set('state', 'swapped-state');
  const wrong = await client.post(`${DEVIANTART_OAUTH.path}/complete`).send({ responseUrl: url.href });
  expect(wrong.body.result).toBe('expired');
  expect(fetch).not.toHaveBeenCalled();
  const valid = await client.post(`${DEVIANTART_OAUTH.path}/complete`).send({ responseUrl: returned() });
  expect(valid.body.result).toBe('connected');
});

it.each(['denied', 'busy', 'account-change', 'expiration', 'provider-error'])(
  'preserves the previous account on HTTP return outcome: %s',
  async (scenario) => {
    const station = await fixture();
    const { client, directory, fetch } = station;
    await client
      .post(DEVIANTART.path)
      .send({
        action: DEVIANTART_ACTION.account,
        ...APP,
        refreshToken: 'previous-grant',
      })
      .expect(HTTP_STATUS.ok);
    const started = await client.post(`${DEVIANTART_OAUTH.path}/start`).send({});
    const state = new URL(started.body.authorizationUrl).searchParams.get('state')!;
    const returned = new URL(DEVIANTART_OAUTH.loopbackReturn);
    returned.search = new URLSearchParams({ state, code: CODE }).toString();
    let release: (() => void) | null = null;
    if (scenario === 'denied') {
      returned.searchParams.delete('code');
      returned.searchParams.set('error', 'access_denied');
      returned.searchParams.set('error_description', 'private-provider-description');
    } else if (scenario === 'busy') {
      release = tryDeviantartLock(directory);
    } else if (scenario === 'account-change') {
      await client.post(DEVIANTART.path).send({
        action: DEVIANTART_ACTION.account,
        ...APP,
        refreshToken: 'previous-grant',
      });
    } else if (scenario === 'expiration') {
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + DEVIANTART_OAUTH.lifetimeMilliseconds + 1);
    } else if (scenario === 'provider-error') {
      fetch.mockRejectedValueOnce(new Error('private-provider-description'));
    }
    try {
      const result = await client.post(`${DEVIANTART_OAUTH.path}/complete`).send({ responseUrl: returned.href });
      expect(result.body.result).not.toBe('connected');
      expect(JSON.stringify(result.body)).not.toContain('private-provider-description');
      expect(new DeviantartStore(directory).read().account?.refreshToken).toBe('previous-grant');
      if (scenario !== 'provider-error') {
        expect(fetch).not.toHaveBeenCalled();
      }
    } finally {
      release?.();
    }
  },
);

it('retains a completed HTTP grant across fresh browser sessions and server application reconstruction', async () => {
  const { client, directory, returned, configuration, queue } = await fixture();
  await client.post(`${DEVIANTART_OAUTH.path}/complete`).send({ responseUrl: returned() }).expect(HTTP_STATUS.ok);
  const store = new DeviantartStore(directory);
  const original = readFileSync(store.filename, 'utf8');
  const fresh = request.agent(createApplication(configuration, queue));
  await fresh.post('/api/session').send({ token: configuration.accessToken }).expect(HTTP_STATUS.noContent);
  const metadata = await fresh.get(DEVIANTART.path).expect(HTTP_STATUS.ok);
  expect(metadata.body).toMatchObject({ hasAccount: true, customClient: true });
  expect(JSON.stringify(metadata.body)).not.toMatch(/private-http|private-one-use/);
  await fresh.get(DEVIANTART_OAUTH.path).expect(HTTP_STATUS.ok);
  expect(readFileSync(store.filename, 'utf8')).toBe(original);
  expect(new DeviantartStore(directory).read().account?.refreshToken).toBe(TOKEN);
});
