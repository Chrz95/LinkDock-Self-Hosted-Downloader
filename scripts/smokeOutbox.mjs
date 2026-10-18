import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import request from 'supertest';
import { createApplication } from '../dist-server/server/app.js';
import { NotificationService } from '../dist-server/server/notifications/service.js';
import { PushStore } from '../dist-server/server/notifications/store.js';
import { AlertOutbox } from '../dist-server/server/notifications/outbox.js';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../dist-server/shared/contracts.js';
import { NOTIFICATION_PATH, PUSH_LIMIT } from '../dist-server/shared/notifications.js';

/**
 * Seeds a future retry and verifies compiled private status/clear routes without ever contacting a provider.
 * @param {ServerConfig} configuration - Isolated fixture volume and owner session.
 * @param {DownloadQueue} queue - Stopped station queue.
 * @returns {Promise<void>} Backlog restoration, protected aggregate status and explicit clearing verified.
 */
export async function smokeOutbox(configuration, queue) {
  const browserKey = createECDH('prime256v1');
  browserKey.generateKeys();
  const subscription = {
    endpoint: 'https://push.example/native-fixture',
    keys: {
      p256dh: browserKey.getPublicKey().toString('base64url'),
      auth: randomBytes(PUSH_LIMIT.authenticationBytes).toString('base64url'),
    },
  };
  const store = new PushStore(configuration.dataDirectory);
  store.add(subscription);
  const outbox = new AlertOutbox(configuration.dataDirectory);
  outbox.enqueue(DOWNLOAD_STATUS.completed, [subscription], Date.now());
  outbox.claim(outbox.list()[0].id, Date.now());
  const notifications = new NotificationService({
    ...configuration,
    secureCookie: true,
    publicOrigin: 'https://station.example',
    webPushSubject: 'mailto:owner@example.com',
  });
  try {
    assert.equal(notifications.configurationForBrowser().enabled, true);
    assert.ok(notifications.configurationForBrowser().publicKey);
    const client = request.agent(createApplication(configuration, queue, notifications));
    const endpoint = `${API_PATH.notifications}${NOTIFICATION_PATH.outbox}`;
    await client.get(endpoint).expect(HTTP_STATUS.unauthorized);
    await client.post(API_PATH.session).send({ token: configuration.accessToken }).expect(HTTP_STATUS.noContent);
    const status = await client.get(endpoint).expect(HTTP_STATUS.ok);
    assert.equal(status.headers['cache-control'], 'no-store');
    assert.equal(status.body.pending, 1);
    assert.equal(status.body.retrying, 1);
    assert.equal(status.body.sending, 0);
    assert.ok(!status.text.includes(subscription.endpoint));
    await client.get('/notifications/outbox.json').expect(HTTP_STATUS.notFound);
    await client.delete(endpoint).send({}).expect(HTTP_STATUS.noContent);
    assert.deepEqual(new AlertOutbox(configuration.dataDirectory).list(), []);
    process.stdout.write('Compiled durable outbox restoration, private aggregate status and explicit clear: passed.\n');
  } finally {
    await notifications.stop();
  }
}
