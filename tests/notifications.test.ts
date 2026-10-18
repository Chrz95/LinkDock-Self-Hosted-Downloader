import { createECDH, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PushStore, validateSubscription } from '../server/notifications/store';
import { NotificationService } from '../server/notifications/service';
import { sendPush, PushDeliveryError } from '../server/notifications/send';
import { resolvePublicTarget } from '../server/security/target';
import { createQueuedJob } from '../server/downloads/batch';
import { resolveDownloadRequest } from '../server/engines/detectSource';
import { DOWNLOAD_STATUS } from '../shared/contracts';
import { PUSH_LIMIT, PUSH_MESSAGE, type BrowserSubscription } from '../shared/notifications';
import type { ServerConfig } from '../server/config';

vi.mock('../server/notifications/send', () => ({
  sendPush: vi.fn(),
  PushDeliveryError: class extends Error {
    /** @param {number} statusCode - Fake provider status. */
    constructor(readonly statusCode: number) {
      super('Provider rejected alert.');
    }
  },
}));
vi.mock('../server/security/target', async (original) => ({
  ...(await original<typeof import('../server/security/target')>()),
  resolvePublicTarget: vi.fn(),
}));
vi.mock('../src/lib/logger/logger', () => ({ logger: { error: vi.fn() } }));
const directories: string[] = [];
const services: NotificationService[] = [];
const PORT = 8_080;
const FILE_LIMIT = 1_024;

/** Creates isolated notification storage. @returns {string} Temporary station directory. */
function temporaryDirectory(): string {
  const directory = mkdtempSync(path.resolve('tests/.push-'));
  directories.push(directory);
  return directory;
}
/**
 * Creates real browser encryption material without contacting a provider.
 * @param {string} [endpoint] - Fake public HTTPS service.
 * @returns {BrowserSubscription} Valid P-256 browser subscription.
 */
function browserSubscription(endpoint = 'https://push.example/device'): BrowserSubscription {
  const key = createECDH('prime256v1');
  key.generateKeys();
  return {
    endpoint,
    keys: {
      p256dh: key.getPublicKey().toString('base64url'),
      auth: randomBytes(PUSH_LIMIT.authenticationBytes).toString('base64url'),
    },
  };
}
/**
 * Creates an optional push service using isolated state and mocked delivery.
 * @param {boolean} [enabled] - Whether the owner configured HTTPS alerts.
 * @returns {object} Service and configuration under test.
 */
function createService(enabled = true) {
  const configuration: ServerConfig = {
    dataDirectory: temporaryDirectory(),
    port: PORT,
    accessToken: 'test-password-at-least-32-characters',
    concurrency: 1,
    maximumFileBytes: FILE_LIMIT,
    secureCookie: enabled,
    publicOrigin: enabled ? 'https://station.example' : undefined,
    isProduction: false,
    webPushSubject: enabled ? 'mailto:owner@example.com' : undefined,
  };
  const service = new NotificationService(configuration);
  services.push(service);
  vi.mocked(resolvePublicTarget).mockResolvedValue({ address: '93.184.216.34', family: 4 });
  vi.mocked(sendPush).mockResolvedValue(undefined);
  return { service, configuration };
}
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.stop()));
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  vi.mocked(sendPush).mockReset();
  vi.mocked(resolvePublicTarget).mockReset();
});

it('keeps alerts dormant without owner setup and exposes no private state', async () => {
  const { service, configuration } = createService(false);
  expect(service.configurationForBrowser()).toMatchObject({ enabled: false, publicKey: null });
  expect(existsSync(path.join(configuration.dataDirectory, 'notifications'))).toBe(false);
  await expect(service.register(browserSubscription())).rejects.toThrow('not configured');
  expect(sendPush).not.toHaveBeenCalled();
});

it('persists a private signing identity and bounded, isolated registrations across restarts', () => {
  const directory = temporaryDirectory();
  const first = new PushStore(directory);
  const subscription = browserSubscription();
  first.add(subscription);
  first.add(subscription);
  const copy = first.list();
  copy[0]!.keys.auth = 'changed';
  const restored = new PushStore(directory);
  expect(restored.keys).toEqual(first.keys);
  expect(restored.list()).toEqual([subscription]);
  const permissionsMask = 0o777;
  const ownerReadWrite = 0o600;
  expect(statSync(path.join(directory, 'notifications', 'vapid.json')).mode & permissionsMask).toBe(ownerReadWrite);
  for (let index = 1; index < PUSH_LIMIT.maximumDevices; index += 1) {
    restored.add({ ...subscription, endpoint: `https://push.example/${index}` });
  }
  expect(() => restored.add(browserSubscription('https://push.example/extra'))).toThrow('limit');
  expect(new PushStore(directory).list()).toHaveLength(PUSH_LIMIT.maximumDevices);
});

it('rejects malformed browser keys, unsafe endpoints and mismatched saved identities', () => {
  const subscription = browserSubscription();
  expect(() => validateSubscription({ ...subscription, endpoint: 'http://push.example/device' })).toThrow();
  expect(() =>
    validateSubscription({ ...subscription, endpoint: 'https://user:secret@push.example/device' }),
  ).toThrow();
  expect(() => validateSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: 'bad' } })).toThrow();
  const directory = temporaryDirectory();
  const store = new PushStore(directory);
  writeFileSync(
    path.join(directory, 'notifications', 'vapid.json'),
    JSON.stringify({ ...store.keys, publicKey: 'bad' }),
  );
  expect(() => new PushStore(directory)).toThrow('do not match');
});

it('validates public DNS before persisting and permits test delivery only to a registered browser', async () => {
  const { service, configuration } = createService();
  const subscription = browserSubscription();
  await expect(service.test(subscription.endpoint)).rejects.toThrow('Enable alerts');
  vi.mocked(resolvePublicTarget).mockRejectedValueOnce(new Error('Private destination rejected.'));
  await expect(service.register(subscription)).rejects.toThrow('Private destination');
  expect(service.has(subscription.endpoint)).toBe(false);
  await service.register(subscription);
  await service.test(subscription.endpoint);
  expect(sendPush).toHaveBeenCalledWith(
    subscription,
    JSON.stringify({ kind: 'test', body: PUSH_MESSAGE.test }),
    expect.any(Object),
    configuration.webPushSubject,
  );
  expect(service.configurationForBrowser()).not.toHaveProperty('privateKey');
  service.unregister(subscription.endpoint);
  expect(
    JSON.parse(readFileSync(path.join(configuration.dataDirectory, 'notifications', 'subscriptions.json'), 'utf8')),
  ).toEqual([]);
});

it('sends generic terminal alerts asynchronously and prunes an expired browser', async () => {
  const { service } = createService();
  const subscription = browserSubscription();
  await service.register(subscription);
  const job = createQueuedJob(resolveDownloadRequest('https://example.com/private-name.zip', undefined, undefined));
  service.enqueue(job);
  job.status = DOWNLOAD_STATUS.cancelled;
  service.enqueue(job);
  expect(sendPush).not.toHaveBeenCalled();
  job.status = DOWNLOAD_STATUS.completed;
  service.enqueue(job);
  await vi.waitFor(() => expect(sendPush).toHaveBeenCalledTimes(1));
  const [, payload] = vi.mocked(sendPush).mock.calls[0]!;
  expect(JSON.parse(payload)).toEqual({ kind: 'completed', body: PUSH_MESSAGE.completed });
  expect(payload).not.toContain(job.url);
  expect(payload).not.toContain(job.filename);
  const expiredStatus = 410;
  vi.mocked(sendPush).mockRejectedValueOnce(new PushDeliveryError(expiredStatus));
  await expect(service.test(subscription.endpoint)).rejects.toThrow();
  expect(service.has(subscription.endpoint)).toBe(false);
});

it('bounds simultaneous delivery and coalesces terminal bursts by category', async () => {
  const { service } = createService();
  const deviceCount = 3;
  const repeatedEvents = 50;
  for (let index = 0; index < deviceCount; index += 1) {
    await service.register(browserSubscription(`https://push.example/${index}`));
  }
  const gateControl: { release?: () => void } = {};
  const gate = new Promise<void>((resolve) => {
    gateControl.release = resolve;
  });
  let active = 0;
  let peak = 0;
  vi.mocked(sendPush).mockImplementation(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await gate;
    active -= 1;
  });
  const job = createQueuedJob(resolveDownloadRequest('https://example.com/file', undefined, undefined));
  job.status = DOWNLOAD_STATUS.completed;
  service.enqueue(job);
  expect(sendPush).toHaveBeenCalledTimes(PUSH_LIMIT.sendConcurrency);
  for (let index = 0; index < repeatedEvents; index += 1) {
    service.enqueue(job);
  }
  job.status = DOWNLOAD_STATUS.failed;
  service.enqueue(job);
  gateControl.release!();
  const expectedCategories = 3;
  await vi.waitFor(() => expect(sendPush).toHaveBeenCalledTimes(deviceCount * expectedCategories));
  expect(peak).toBeLessThanOrEqual(PUSH_LIMIT.sendConcurrency);
});
