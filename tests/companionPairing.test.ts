import { readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import http from 'node:http';
import path from 'node:path';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createDeliveryFixture, cleanupDeliveryFixtures } from './helpers/deliveryFixture';
import { CompanionStore } from '../server/companion/store';
import { COMPANION } from '../shared/companion';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import { resolvePublicTarget } from '../server/security/target';

vi.mock('../server/security/target', async (original) => ({
  ...(await original<typeof import('../server/security/target')>()),
  resolvePublicTarget: vi.fn(),
}));

const EXTENSION_ID_LENGTH = 32;
const extension = `chrome-extension://${'a'.repeat(EXTENSION_ID_LENGTH)}`;
const otherExtension = `chrome-extension://${'b'.repeat(EXTENSION_ID_LENGTH)}`;
const source = { url: 'https://www.youtube.com/watch?v=paired-video', sourceType: 'video', quality: 'mp3-192' };
const publicAddress = { address: '93.184.216.34', family: 4 };
const capturedUrl = 'http://source.example/download?key=example';
const FOUND_REDIRECT = 302;
afterEach(cleanupDeliveryFixtures);

it('requires an owner session and same-origin JSON to create or revoke a connection', async () => {
  const fixture = await createDeliveryFixture();
  await fixture.client.post(COMPANION.path).send({ extensionOrigin: extension }).expect(HTTP_STATUS.unauthorized);
  await fixture.login();
  await fixture.client
    .post(COMPANION.path)
    .set('Origin', extension)
    .send({ extensionOrigin: extension })
    .expect(HTTP_STATUS.forbidden);
  await fixture.client
    .post(COMPANION.path)
    .send({ extensionOrigin: 'https://untrusted.example' })
    .expect(HTTP_STATUS.badRequest);
  const paired = await fixture.client
    .post(COMPANION.path)
    .send({ extensionOrigin: extension })
    .expect(HTTP_STATUS.created);
  expect(paired.body.token).toMatch(/^ldc_[a-f\d]{64}$/u);
  const listed = await fixture.client.get(COMPANION.path).expect(HTTP_STATUS.ok);
  expect(listed.body.connections).toEqual([paired.body.connection]);
  expect(listed.text).not.toMatch(/ldc_|hash|signature|chrome-extension/);
  await fixture.client
    .delete(`${COMPANION.path}/${paired.body.connection.id}`)
    .set('Origin', 'https://untrusted.example')
    .send({})
    .expect(HTTP_STATUS.forbidden);
});

it('queues through a standalone bearer request after the browser station session is closed', async () => {
  const fixture = await createDeliveryFixture();
  await fixture.login();
  const paired = await fixture.client.post(COMPANION.path).send({ extensionOrigin: extension });
  await fixture.client.delete(API_PATH.session).send({}).expect(HTTP_STATUS.noContent);
  const response = await request(fixture.application)
    .post(`${COMPANION.clientPath}/downloads`)
    .set('Origin', extension)
    .set('X-LinkDock-Extension', extension)
    .auth(paired.body.token, { type: 'bearer' })
    .send(source)
    .expect(HTTP_STATUS.created);
  expect(response.body).toEqual({ accepted: true });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['access-control-allow-origin']).toBe(extension);
  expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(fixture.queue.store.jobs[0]).toMatchObject({ sourceType: 'video', quality: 'mp3-192' });
  await request(fixture.application)
    .get(API_PATH.downloads)
    .auth(paired.body.token, { type: 'bearer' })
    .expect(HTTP_STATUS.unauthorized);
  await request(fixture.application)
    .post('/api/browser-access')
    .auth(paired.body.token, { type: 'bearer' })
    .send({ action: 'clear' })
    .expect(HTTP_STATUS.unauthorized);
});

it.each([HTTP_STATUS.notFound, HTTP_STATUS.ok])(
  'reports whether file bytes started after the captured source redirects to HTTP %s',
  async (sourceStatus) => {
    const hits: (string | undefined)[] = [];
    const upstream = http.createServer((incoming, outgoing) => {
      hits.push(incoming.url);
      if (incoming.url === '/download?key=example') {
        outgoing.writeHead(FOUND_REDIRECT, { Location: '/fresh-file' }).end();
      } else {
        outgoing.writeHead(sourceStatus, { 'Content-Type': 'application/octet-stream' }).end('source bytes');
      }
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    try {
      const address = upstream.address();
      if (!address || typeof address === 'string') {
        throw new Error('Missing upstream fixture address.');
      }
      vi.mocked(resolvePublicTarget).mockResolvedValue(publicAddress);
      const { get } = http;
      vi.spyOn(http, 'get').mockImplementation((...args: unknown[]) => {
        const [url, options, callback] = args as [URL, http.RequestOptions, (response: http.IncomingMessage) => void];
        return get(
          url,
          {
            ...options,
            port: address.port,
            lookup: (_hostname, _options, complete) => complete(null, '127.0.0.1', publicAddress.family),
          },
          callback,
        );
      });
      const fixture = await createDeliveryFixture(true);
      await fixture.login();
      const paired = await fixture.client.post(COMPANION.path).send({ extensionOrigin: extension });
      const response = await request(fixture.application)
        .post(`${COMPANION.clientPath}/downloads`)
        .set('X-LinkDock-Extension', extension)
        .auth(paired.body.token, { type: 'bearer' })
        .send({ url: capturedUrl, sourceType: 'video', browserCapture: true })
        .expect(HTTP_STATUS.created);
      const sourceStarted = sourceStatus === HTTP_STATUS.ok;
      expect(response.body).toEqual({ accepted: true, sourceStarted, ...(!sourceStarted && { sourceFailed: true }) });
      expect(hits).toEqual(['/download?key=example', '/fresh-file']);
      const [job] = fixture.queue.store.jobs;
      expect(job).toMatchObject({ url: capturedUrl, sourceType: 'direct' });
      if (sourceStarted) {
        expect(job?.receivedBytes).toBeGreaterThan(0);
      } else {
        expect(job).toMatchObject({ status: DOWNLOAD_STATUS.failed, errorMessage: 'The source returned HTTP 404.' });
      }
    } finally {
      upstream.closeAllConnections();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  },
);

it('rejects ordinary website origins, mismatched extensions and cookie-only requests on the narrow API', async () => {
  const fixture = await createDeliveryFixture();
  await fixture.login();
  const paired = await fixture.client.post(COMPANION.path).send({ extensionOrigin: extension });
  await fixture.client
    .post(`${COMPANION.clientPath}/downloads`)
    .set('X-LinkDock-Extension', extension)
    .send(source)
    .expect(HTTP_STATUS.unauthorized);
  await request(fixture.application)
    .post(`${COMPANION.clientPath}/downloads`)
    .set('Origin', 'https://untrusted.example')
    .set('X-LinkDock-Extension', extension)
    .auth(paired.body.token, { type: 'bearer' })
    .send(source)
    .expect(HTTP_STATUS.forbidden);
  await request(fixture.application)
    .post(`${COMPANION.clientPath}/downloads`)
    .set('Origin', otherExtension)
    .set('X-LinkDock-Extension', otherExtension)
    .auth(paired.body.token, { type: 'bearer' })
    .send(source)
    .expect(HTTP_STATUS.unauthorized);
  await request(fixture.application)
    .post(`${COMPANION.clientPath}/downloads`)
    .set('Origin', otherExtension)
    .set('X-LinkDock-Extension', extension)
    .auth(paired.body.token, { type: 'bearer' })
    .send(source)
    .expect(HTTP_STATUS.forbidden);
  expect(fixture.queue.store.jobs).toHaveLength(0);
});

it('handles extension preflight while never granting website CORS or cookie authority', async () => {
  const fixture = await createDeliveryFixture();
  const response = await request(fixture.application)
    .options(`${COMPANION.clientPath}/downloads`)
    .set('Origin', extension)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'Authorization, Content-Type, X-LinkDock-Extension')
    .expect(HTTP_STATUS.noContent);
  expect(response.headers['access-control-allow-origin']).toBe(extension);
  expect(response.headers['access-control-allow-headers']).toContain('Authorization');
  const refused = await request(fixture.application)
    .options(`${COMPANION.clientPath}/downloads`)
    .set('Origin', 'https://untrusted.example')
    .expect(HTTP_STATUS.forbidden);
  expect(refused.headers['access-control-allow-origin']).toBeUndefined();
});

it('revokes connections immediately from Settings or through their own limited credential', async () => {
  const fixture = await createDeliveryFixture();
  await fixture.login();
  const first = await fixture.client.post(COMPANION.path).send({ extensionOrigin: extension });
  const second = await fixture.client.post(COMPANION.path).send({ extensionOrigin: extension });
  await fixture.client.delete(`${COMPANION.path}/${first.body.connection.id}`).send({}).expect(HTTP_STATUS.noContent);
  await request(fixture.application)
    .post(`${COMPANION.clientPath}/downloads`)
    .set('X-LinkDock-Extension', extension)
    .auth(first.body.token, { type: 'bearer' })
    .send(source)
    .expect(HTTP_STATUS.unauthorized);
  await request(fixture.application)
    .delete(`${COMPANION.clientPath}/connection`)
    .set('X-LinkDock-Extension', extension)
    .auth(second.body.token, { type: 'bearer' })
    .expect(HTTP_STATUS.noContent);
  await request(fixture.application)
    .post(`${COMPANION.clientPath}/downloads`)
    .set('X-LinkDock-Extension', extension)
    .auth(second.body.token, { type: 'bearer' })
    .send(source)
    .expect(HTTP_STATUS.unauthorized);
  expect((await fixture.client.get(COMPANION.path)).body.connections).toEqual([]);
});

it('persists only hashed credentials, enforces expiry, and invalidates connections on password rotation', async () => {
  const fixture = await createDeliveryFixture();
  const store = new CompanionStore(fixture.directory, fixture.configuration.accessToken);
  const pair = store.create(extension);
  const filename = path.join(fixture.directory, 'credentials', 'companions.json');
  expect(readFileSync(filename, 'utf8')).not.toContain(pair.token);
  expect(
    new CompanionStore(fixture.directory, fixture.configuration.accessToken).authorize(pair.token, extension),
  ).toEqual(pair.connection);
  expect(
    new CompanionStore(fixture.directory, 'different-station-password').authorize(pair.token, extension),
  ).toBeUndefined();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(pair.connection.expiresAt));
  expect(store.authorize(pair.token, extension)).toBeUndefined();
});

it('bounds registry size and rejects tampered expiry or corrupt state without erasing it', async () => {
  const fixture = await createDeliveryFixture();
  const store = new CompanionStore(fixture.directory, fixture.configuration.accessToken);
  const pair = store.create(extension);
  const filename = path.join(fixture.directory, 'credentials', 'companions.json');
  const saved = JSON.parse(readFileSync(filename, 'utf8'));
  saved[0].expiresAt = '2099-01-01T00:00:00Z';
  writeFileSync(filename, JSON.stringify(saved));
  expect(store.authorize(pair.token, extension)).toBeUndefined();
  for (let index = 0; index < COMPANION.maximumConnections; index += 1) {
    store.create(extension);
  }
  expect(() => store.create(extension)).toThrow('limit reached');
  writeFileSync(filename, 'corrupt-private-state');
  expect(() => store.list()).toThrow('unreadable');
  expect(readFileSync(filename, 'utf8')).toBe('corrupt-private-state');
});
