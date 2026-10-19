import { createHash } from 'node:crypto';
import { readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { DEVIANTART, DEVIANTART_ACTION } from '../shared/deviantart';
import { DEVIANTART_OAUTH } from '../shared/deviantartOAuth';
import { HTTP_STATUS } from '../shared/contracts';
import { DeviantartStore } from '../server/deviantart/store';
import { readOAuthApp } from '../server/deviantart/oauthApp';
import { DeviantartOAuthService } from '../server/deviantart/oauthService';
import { tryDeviantartLock } from '../server/deviantart/lock';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';
const APP = { clientId: '123456', clientSecret: 'private-confidential-app-secret' };
const ORIGIN = 'https://station.example';
const CODE = 'one-use-provider-code';
const TOKEN = 'new-private-refresh-token';
const FILE_MODE = 0o600;
const PERMISSION_MASK = 0o777;
/**
 * Creates an owner-authenticated station with a private app registration and fixed external callback origin.
 * @returns {Promise<object>} Isolated station and start helper.
 */
async function fixture() {
  const station = await createDeliveryFixture();
  station.configuration.publicOrigin = ORIGIN;
  await station.login();
  await station.client.post(`${DEVIANTART_OAUTH.path}/setup`).send(APP).expect(HTTP_STATUS.ok);
  /** Starts a fresh browser-bound sign-in. @returns {Promise<object>} State and dedicated cookie. */
  async function start() {
    const response = await station.client.post(`${DEVIANTART_OAUTH.path}/start`).send({}).expect(HTTP_STATUS.ok);
    const url = new URL(response.body.authorizationUrl);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return { url, state: url.searchParams.get('state')!, cookie: cookies[0]!.split(';')[0]!, response };
  }
  return { ...station, start };
}
/**
 * Installs a local provider response; no test contacts DeviantArt or uses real credentials.
 * @param {unknown} [payload] - Token endpoint fixture.
 * @param {number} [status] - Token endpoint HTTP status.
 * @returns {ReturnType<typeof vi.fn>} Recorded fixed-endpoint exchange.
 */
function provider(
  payload: unknown = { access_token: 'ephemeral-access', refresh_token: TOKEN },
  status: number = HTTP_STATUS.ok,
) {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await cleanupDeliveryFixtures();
});

it('requires an owner session and same-origin JSON for every app setup and authorization start', async () => {
  const { client, login } = await createDeliveryFixture();
  await client.get(DEVIANTART_OAUTH.path).expect(HTTP_STATUS.unauthorized);
  for (const operation of ['setup', 'start']) {
    await client.post(`${DEVIANTART_OAUTH.path}/${operation}`).send(APP).expect(HTTP_STATUS.unauthorized);
  }
  await login();
  await client
    .post(`${DEVIANTART_OAUTH.path}/setup`)
    .set('Origin', 'https://other.example')
    .send(APP)
    .expect(HTTP_STATUS.forbidden);
  await client.post(`${DEVIANTART_OAUTH.path}/start`).send({}).expect(HTTP_STATUS.conflict);
  const fetch = provider();
  await client.get(DEVIANTART_OAUTH.callback).expect(DEVIANTART_OAUTH.redirectStatus);
  expect(fetch).not.toHaveBeenCalled();
});

it('stores confidential setup privately and exposes only its configured flag and exact callback URL', async () => {
  const { client, directory } = await fixture();
  const metadata = await client.get(DEVIANTART_OAUTH.path).expect(HTTP_STATUS.ok);
  expect(metadata.body).toEqual({
    configured: true,
    callbackUrl: `${ORIGIN}${DEVIANTART_OAUTH.callback}`,
    returnMode: 'direct',
  });
  expect(metadata.headers['cache-control']).toBe('no-store');
  expect(JSON.stringify(metadata.body)).not.toMatch(/123456|private-confidential/);
  const filename = path.join(new DeviantartStore(directory).directory, 'oauth-app.json');
  expect(statSync(filename).mode & PERMISSION_MASK).toBe(FILE_MODE);
  expect(readOAuthApp(directory)).toEqual(APP);
  expect(readFileSync(path.join(directory, 'history.json'), 'utf8')).not.toContain(APP.clientSecret);
  for (const input of [{}, { ...APP, clientId: '--exec' }, { ...APP, clientSecret: 'line\nsecret' }]) {
    await client.post(`${DEVIANTART_OAUTH.path}/setup`).send(input).expect(HTTP_STATUS.badRequest);
    expect(readOAuthApp(directory)).toEqual(APP);
  }
});

it('exchanges a browser-bound PKCE code privately and returns clean Settings navigation', async () => {
  const { application, client, directory, start } = await fixture();
  const { url, state, cookie, response } = await start();
  expect(url.origin + url.pathname).toBe('https://www.deviantart.com/oauth2/authorize');
  expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}${DEVIANTART_OAUTH.callback}`);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('scope')).toBe('browse');
  expect(url.searchParams.get('view')).toBe('login');
  expect(url.searchParams.has('client_secret')).toBe(false);
  expect(response.headers['set-cookie']![0]).toMatch(/HttpOnly; SameSite=Lax/);
  expect(response.headers['set-cookie']![0]).toContain(`Path=${DEVIANTART_OAUTH.path}`);
  const fetch = provider();
  // SameSite=Strict station cookies are absent on a cross-site callback; the one-use binding authorizes it.
  const returned = await request(application)
    .get(DEVIANTART_OAUTH.callback)
    .query({ state, code: CODE })
    .set('Cookie', cookie)
    .expect(DEVIANTART_OAUTH.redirectStatus);
  expect(returned.headers.location).toBe('/?deviantart=connected#settings');
  expect(returned.headers['referrer-policy']).toBe('no-referrer');
  expect(returned.headers['cache-control']).toBe('no-store');
  expect(returned.text).not.toMatch(/one-use-provider|new-private-refresh|private-confidential/);
  expect(fetch).toHaveBeenCalledOnce();
  const [endpoint, options] = fetch.mock.calls[0]!;
  expect(endpoint).toBe('https://www.deviantart.com/oauth2/token');
  expect(options.redirect).toBe('error');
  expect(options.signal).toBeInstanceOf(AbortSignal);
  const body = options.body as URLSearchParams;
  expect(body.get('code')).toBe(CODE);
  expect(body.get('client_id')).toBe(APP.clientId);
  expect(body.get('client_secret')).toBe(APP.clientSecret);
  expect(body.get('redirect_uri')).toBe(url.searchParams.get('redirect_uri'));
  expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(
    url.searchParams.get('code_challenge'),
  );
  expect(new DeviantartStore(directory).read().account).toMatchObject({ ...APP, refreshToken: TOKEN });
  await request(application).get(DEVIANTART.path).set('Cookie', cookie).expect(HTTP_STATUS.unauthorized);
  const metadata = await client.get(DEVIANTART.path).expect(HTTP_STATUS.ok);
  expect(metadata.body.hasAccount).toBe(true);
  expect(JSON.stringify(metadata.body)).not.toContain(TOKEN);
  const replay = await client.get(DEVIANTART_OAUTH.callback).query({ state, code: CODE }).set('Cookie', cookie);
  expect(replay.headers.location).toContain('deviantart=expired');
  expect(fetch).toHaveBeenCalledOnce();
});

it('rejects missing, wrong or cross-browser state bindings without redeeming the real pending grant', async () => {
  const { application, start } = await fixture();
  const pending = await start();
  const fetch = provider();
  for (const [state, cookie] of [
    [pending.state, ''],
    ['wrong-state', pending.cookie],
    [pending.state, 'wrong=browser'],
  ]) {
    const result = await request(application)
      .get(DEVIANTART_OAUTH.callback)
      .query({ state, code: CODE })
      .set('Cookie', cookie!)
      .expect(DEVIANTART_OAUTH.redirectStatus);
    expect(result.headers.location).toContain('deviantart=expired');
  }
  expect(fetch).not.toHaveBeenCalled();
  const result = await request(application)
    .get(DEVIANTART_OAUTH.callback)
    .query({ state: pending.state, code: CODE })
    .set('Cookie', pending.cookie);
  expect(result.headers.location).toContain('deviantart=connected');
  expect(fetch).toHaveBeenCalledOnce();
});

it.each(['denial', 'expiration', 'account-change', 'app-change', 'missing-code'])(
  'preserves an existing account without network access on %s',
  async (scenario) => {
    const { client, directory, start } = await fixture();
    const store = new DeviantartStore(directory);
    store.replaceAccount(store.read(), { ...APP, refreshToken: 'previous-token' });
    const original = store.read().account;
    const pending = await start();
    const fetch = provider();
    if (scenario === 'expiration') {
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + DEVIANTART_OAUTH.lifetimeMilliseconds + 1);
    } else if (scenario === 'account-change') {
      await client
        .post(DEVIANTART.path)
        .send({ action: DEVIANTART_ACTION.account, ...original })
        .expect(HTTP_STATUS.ok);
    } else if (scenario === 'app-change') {
      await client.post(`${DEVIANTART_OAUTH.path}/setup`).send(APP).expect(HTTP_STATUS.ok);
    }
    const result = await client
      .get(DEVIANTART_OAUTH.callback)
      .query({
        state: pending.state,
        ...(scenario === 'denial' ? { error: 'access_denied', error_description: 'private-provider-prose' } : {}),
        ...(scenario === 'missing-code' ? {} : { code: CODE }),
      })
      .set('Cookie', pending.cookie);
    expect(result.headers.location).not.toContain('deviantart=connected');
    expect(result.text).not.toContain('private-provider-prose');
    expect(store.read().account?.refreshToken).toBe('previous-token');
    expect(fetch).not.toHaveBeenCalled();
  },
);

it('rejects sign-in starts and callback account replacement while a DeviantArt download owns the grant', async () => {
  const { client, directory, start } = await fixture();
  const pending = await start();
  const release = tryDeviantartLock(directory)!;
  const fetch = provider();
  try {
    await client.post(`${DEVIANTART_OAUTH.path}/start`).send({}).expect(HTTP_STATUS.conflict);
    await client.post(`${DEVIANTART_OAUTH.path}/setup`).send(APP).expect(HTTP_STATUS.conflict);
    const result = await client
      .get(DEVIANTART_OAUTH.callback)
      .query({ state: pending.state, code: CODE })
      .set('Cookie', pending.cookie);
    expect(result.headers.location).toContain('deviantart=busy');
    expect(new DeviantartStore(directory).snapshot().hasAccount).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    release();
  }
});

it.each([
  [{ error: 'invalid_grant', error_description: 'provider-private-detail' }, HTTP_STATUS.badRequest],
  [{ access_token: 'a' }, HTTP_STATUS.ok],
  [{ access_token: 'a', refresh_token: 'bad\ntoken' }, HTTP_STATUS.ok],
  [{ access_token: 'a', refresh_token: 'x'.repeat(DEVIANTART.maximumStateBytes) }, HTTP_STATUS.ok],
])(
  'keeps existing credentials and releases the lock after a rejected or invalid token response',
  async (payload, status) => {
    const { client, directory, start } = await fixture();
    const store = new DeviantartStore(directory);
    store.replaceAccount(store.read(), { ...APP, refreshToken: 'previous-token' });
    const pending = await start();
    provider(payload, status);
    const result = await client
      .get(DEVIANTART_OAUTH.callback)
      .query({ state: pending.state, code: CODE })
      .set('Cookie', pending.cookie);
    expect(result.headers.location).toBe('/?deviantart=failed#settings');
    expect(result.text).not.toMatch(/private-detail|previous-token|bad/);
    expect(store.read().account?.refreshToken).toBe('previous-token');
    const release = tryDeviantartLock(directory);
    expect(release).not.toBeNull();
    release?.();
  },
);

it('caps pending authorizations and releases expiration timers after explicit invalidation', async () => {
  const { directory } = await fixture();
  const service = new DeviantartOAuthService(directory);
  try {
    for (let index = 0; index < DEVIANTART_OAUTH.maximumPending; index += 1) {
      service.begin(`${ORIGIN}${DEVIANTART_OAUTH.callback}`);
    }
    expect(() => service.begin(`${ORIGIN}${DEVIANTART_OAUTH.callback}`)).toThrow('Too many');
    service.invalidate();
    expect(() => service.begin(`${ORIGIN}${DEVIANTART_OAUTH.callback}`)).not.toThrow();
  } finally {
    service.invalidate();
  }
});

it('permits collection changes during sign-in and blocks concurrent account writes and replays', async () => {
  const { client, application, directory, start } = await fixture();
  const pending = await start();
  let respond: ((response: Response) => void) | undefined;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const connecting = request(application)
    .get(DEVIANTART_OAUTH.callback)
    .query({ state: pending.state, code: CODE })
    .set('Cookie', pending.cookie)
    .then((response) => response);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await client.post(`${DEVIANTART_OAUTH.path}/setup`).send(APP).expect(HTTP_STATUS.conflict);
  await client.post(DEVIANTART.path).send({ action: DEVIANTART_ACTION.clear }).expect(HTTP_STATUS.conflict);
  await client
    .post(DEVIANTART.path)
    .send({
      action: DEVIANTART_ACTION.preferences,
      include: ['scraps'],
      original: false,
      stories: 'none',
    })
    .expect(HTTP_STATUS.ok);
  const replay = await request(application)
    .get(DEVIANTART_OAUTH.callback)
    .query({ state: pending.state, code: CODE })
    .set('Cookie', pending.cookie);
  expect(replay.headers.location).toContain('deviantart=expired');
  respond!(new Response(JSON.stringify({ access_token: 'access', refresh_token: TOKEN })));
  expect((await connecting).headers.location).toContain('deviantart=connected');
  expect(new DeviantartStore(directory).read()).toMatchObject({
    include: ['scraps'],
    original: false,
    stories: 'none',
    account: { refreshToken: TOKEN },
  });
  expect(fetch).toHaveBeenCalledOnce();
});

it('keeps new collection defaults and replaces abandoned sign-ins from the same browser', async () => {
  const { client, start } = await fixture();
  const previous = await start();
  const pending = await start();
  const fetch = provider();
  const old = await client
    .get(DEVIANTART_OAUTH.callback)
    .query({ state: previous.state, code: CODE })
    .set('Cookie', previous.cookie);
  expect(old.headers.location).toContain('deviantart=expired');
  await client
    .post(DEVIANTART.path)
    .send({
      action: DEVIANTART_ACTION.preferences,
      include: ['gallery'],
      original: false,
      stories: 'none',
    })
    .expect(HTTP_STATUS.ok);
  const current = await client
    .get(DEVIANTART_OAUTH.callback)
    .query({ state: pending.state, code: CODE })
    .set('Cookie', pending.cookie);
  expect(current.headers.location).toContain('deviantart=connected');
  expect(fetch).toHaveBeenCalledOnce();
});

it('fails closed on a symbolic app file and replaces it without touching its target', async () => {
  const { client, directory } = await createDeliveryFixture();
  await client.post('/api/session').send({ token: 'delivery-test-password-at-least-32-characters' });
  const store = new DeviantartStore(directory);
  const outside = path.join(directory, 'outside.json');
  writeFileSync(outside, JSON.stringify(APP));
  symlinkSync(outside, path.join(store.directory, 'oauth-app.json'));
  await client.get(DEVIANTART_OAUTH.path).expect(HTTP_STATUS.conflict);
  await client
    .post(`${DEVIANTART_OAUTH.path}/setup`)
    .send({ ...APP, clientId: '654321' })
    .expect(HTTP_STATUS.ok);
  expect(JSON.parse(readFileSync(outside, 'utf8'))).toEqual(APP);
  expect(readOAuthApp(directory)?.clientId).toBe('654321');
});
