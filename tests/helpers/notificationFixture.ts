import { createECDH, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import type { ServerConfig } from '../../server/config';
import { PUSH_LIMIT, type BrowserSubscription } from '../../shared/notifications';

/**
 * Generates real browser keys without any provider, account, permission prompt or external request.
 * @param {string} [endpoint] - Public-shaped synthetic destination.
 * @returns {BrowserSubscription} Valid canonical registration fixture.
 */
export function notificationSubscription(endpoint = 'https://push.example/device'): BrowserSubscription {
  const keys = createECDH('prime256v1');
  keys.generateKeys();
  return {
    endpoint,
    keys: {
      p256dh: keys.getPublicKey().toString('base64url'),
      auth: randomBytes(PUSH_LIMIT.authenticationBytes).toString('base64url'),
    },
  };
}

/**
 * Creates isolated owner storage for a configured HTTPS notification station.
 * @returns {ServerConfig} Test-owned configuration; callers must remove its directory.
 */
export function notificationConfiguration(): ServerConfig {
  const port = 8_080;
  const maximumFileBytes = 1_024;
  return {
    dataDirectory: mkdtempSync(path.resolve('tests/.notification-outbox-')),
    port,
    accessToken: 'notification-fixture-password-at-least-32-characters',
    concurrency: 1,
    maximumFileBytes,
    secureCookie: true,
    publicOrigin: 'https://station.example',
    isProduction: false,
    webPushSubject: 'mailto:owner@example.com',
  };
}
