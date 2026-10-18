import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotificationService } from '../server/notifications/service';
import { sendPush, PushDeliveryError } from '../server/notifications/send';
import { PushStore } from '../server/notifications/store';
import { AlertOutbox } from '../server/notifications/outbox';
import { resolvePublicTarget } from '../server/security/target';
import { createQueuedJob } from '../server/downloads/batch';
import { resolveDownloadRequest } from '../server/engines/detectSource';
import { createApplication } from '../server/app';
import { DownloadQueue } from '../server/downloads/queue';
import { DOWNLOAD_STATUS, API_PATH, HTTP_STATUS } from '../shared/contracts';
import { NOTIFICATION_PATH, OUTBOX_LIMIT, PUSH_LIMIT } from '../shared/notifications';
import { notificationConfiguration, notificationSubscription } from './helpers/notificationFixture';
import type { ServerConfig } from '../server/config';

vi.mock('../server/notifications/send', async (original) => ({
  ...(await original<typeof import('../server/notifications/send')>()),
  sendPush: vi.fn(),
}));
vi.mock('../server/security/target', async (original) => ({
  ...(await original<typeof import('../server/security/target')>()),
  resolvePublicTarget: vi.fn(),
}));
vi.mock('../src/lib/logger/logger', () => ({ logger: { error: vi.fn() } }));
const directories: string[] = [];
const services: NotificationService[] = [];
const releases: (() => void)[] = [];
const NOW = Date.parse('2026-10-18T12:00:00Z');
const TWO = 2;
const ENDPOINT = `${API_PATH.notifications}${NOTIFICATION_PATH.outbox}`;

/**
 * Restores a configured notification service without contacting a real provider.
 * @param {ServerConfig} [configuration] - Existing fixture volume for restart tests.
 * @returns {object} Service and private configuration.
 */
function createService(configuration: ServerConfig = notificationConfiguration()) {
  if (!directories.includes(configuration.dataDirectory)) {
    directories.push(configuration.dataDirectory);
  }
  const service = new NotificationService(configuration);
  services.push(service);
  return { service, configuration };
}
/** Creates a source-private terminal fixture. @returns {DownloadJob} Completed job. */
function completedJob() {
  const job = createQueuedJob(
    resolveDownloadRequest('https://example.com/private-file?secret=hide', undefined, undefined),
  );
  job.status = DOWNLOAD_STATUS.completed;
  return job;
}
/** Flushes current fake-timer microtasks without advancing retry deadlines. @returns {Promise<void>} Worker settled. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}
/** Holds fake network requests until cleanup. @returns {Promise<void>} Controlled provider acceptance. */
function networkGate(): Promise<void> {
  return new Promise((resolve) => {
    releases.push(resolve);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(resolvePublicTarget).mockResolvedValue({ address: '93.184.216.34', family: 4 });
  vi.mocked(sendPush).mockResolvedValue(undefined);
});
afterEach(async () => {
  releases.splice(0).forEach((release) => release());
  await settle();
  await Promise.all(services.splice(0).map((service) => service.stop()));
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(sendPush).mockReset();
  vi.mocked(resolvePublicTarget).mockReset();
});

it('retries persisted transient failures after restart without resetting attempt counts or deadlines', async () => {
  const { service, configuration } = createService();
  await service.register(notificationSubscription());
  vi.mocked(sendPush).mockRejectedValueOnce(new Error('network unavailable'));
  service.enqueue(completedJob());
  await settle();
  expect(service.deliveryStatus()).toMatchObject({ available: true, pending: 1, retrying: 1, sending: 0 });
  expect(new AlertOutbox(configuration.dataDirectory).list()[0]!.attempts).toBe(1);
  await service.stop();
  const restored = createService(configuration).service;
  await settle();
  expect(sendPush).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(OUTBOX_LIMIT.baseRetryMilliseconds);
  expect(sendPush).toHaveBeenCalledTimes(TWO);
  expect(restored.deliveryStatus().pending).toBe(0);
  expect(new AlertOutbox(configuration.dataDirectory).list()).toEqual([]);
});

it('honors Retry-After, caps attempts and expires stale alerts while the service is stopped', async () => {
  const { service, configuration } = createService();
  const subscription = notificationSubscription();
  await service.register(subscription);
  const retryStatus = 429;
  vi.mocked(sendPush).mockRejectedValue(new PushDeliveryError(retryStatus, OUTBOX_LIMIT.maximumRetryMilliseconds));
  service.enqueue(completedJob());
  await settle();
  await vi.advanceTimersByTimeAsync(OUTBOX_LIMIT.maximumRetryMilliseconds - OUTBOX_LIMIT.sweepMilliseconds);
  expect(sendPush).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(OUTBOX_LIMIT.sweepMilliseconds);
  expect(sendPush).toHaveBeenCalledTimes(TWO);
  for (let attempt = TWO; attempt < OUTBOX_LIMIT.maximumAttempts; attempt += 1) {
    await vi.advanceTimersByTimeAsync(OUTBOX_LIMIT.maximumRetryMilliseconds);
  }
  expect(sendPush).toHaveBeenCalledTimes(OUTBOX_LIMIT.maximumAttempts);
  expect(service.deliveryStatus().pending).toBe(0);
  vi.mocked(sendPush).mockRejectedValueOnce(new Error('network unavailable'));
  service.enqueue(completedJob());
  await settle();
  const beforeRestart = vi.mocked(sendPush).mock.calls.length;
  await service.stop();
  vi.setSystemTime(Date.now() + OUTBOX_LIMIT.maximumAgeMilliseconds);
  const restored = createService(configuration).service;
  await settle();
  expect(restored.deliveryStatus().pending).toBe(0);
  expect(sendPush).toHaveBeenCalledTimes(beforeRestart);
});

it('does not retry permanent rejection and removes all pending categories for an expired registration', async () => {
  const { service } = createService();
  const subscription = notificationSubscription();
  await service.register(subscription);
  const forbidden = 403;
  vi.mocked(sendPush).mockRejectedValueOnce(new PushDeliveryError(forbidden));
  service.enqueue(completedJob());
  await settle();
  expect(service.deliveryStatus().pending).toBe(0);
  expect(service.has(subscription.endpoint)).toBe(true);
  const gone = 410;
  vi.mocked(sendPush).mockRejectedValue(new PushDeliveryError(gone));
  const job = completedJob();
  service.enqueue(job);
  job.status = DOWNLOAD_STATUS.failed;
  service.enqueue(job);
  await settle();
  expect(service.has(subscription.endpoint)).toBe(false);
  expect(service.deliveryStatus().pending).toBe(0);
});

it('never replays pending alerts to a newly registered browser or rotated keys at a reused endpoint', async () => {
  const { service, configuration } = createService();
  const original = notificationSubscription();
  await service.register(original);
  vi.mocked(sendPush).mockRejectedValueOnce(new Error('offline'));
  service.enqueue(completedJob());
  await settle();
  await service.stop();
  const store = new PushStore(configuration.dataDirectory);
  store.remove(original.endpoint);
  store.add(notificationSubscription(original.endpoint));
  store.add(notificationSubscription('https://push.example/new-device'));
  const restored = createService(configuration).service;
  await vi.advanceTimersByTimeAsync(OUTBOX_LIMIT.maximumRetryMilliseconds);
  expect(restored.deliveryStatus().pending).toBe(0);
  expect(sendPush).toHaveBeenCalledTimes(1);
});

it('revokes queued retries on disable and does not recall requests already sending', async () => {
  const { service } = createService();
  const subscription = notificationSubscription();
  await service.register(subscription);
  vi.mocked(sendPush).mockImplementationOnce(() => networkGate());
  service.enqueue(completedJob());
  expect(service.deliveryStatus()).toMatchObject({ pending: 1, sending: 1 });
  service.unregister(subscription.endpoint);
  expect(service.deliveryStatus().pending).toBe(0);
  expect(service.deliveryStatus().sending).toBe(1);
  releases.splice(0).forEach((release) => release());
  await vi.advanceTimersByTimeAsync(OUTBOX_LIMIT.maximumRetryMilliseconds);
  expect(sendPush).toHaveBeenCalledTimes(1);
});

it('shares request slots with explicit tests and never adds failed tests to the durable outbox', async () => {
  const { service } = createService();
  const subscription = notificationSubscription();
  await service.register(subscription);
  vi.mocked(sendPush).mockImplementation(() => networkGate());
  const tests = Array.from({ length: PUSH_LIMIT.sendConcurrency }, () => service.test(subscription.endpoint));
  await expect(service.test(subscription.endpoint)).rejects.toThrow('busy');
  service.enqueue(completedJob());
  expect(service.deliveryStatus()).toMatchObject({ pending: 1, sending: PUSH_LIMIT.sendConcurrency });
  releases.splice(0).forEach((release) => release());
  vi.mocked(sendPush).mockResolvedValue(undefined);
  await Promise.all(tests);
  await settle();
  expect(service.deliveryStatus().pending).toBe(0);
  const expectedRequests = PUSH_LIMIT.sendConcurrency + 1;
  expect(sendPush).toHaveBeenCalledTimes(expectedRequests);
  vi.mocked(sendPush).mockRejectedValueOnce(new Error('offline'));
  await expect(service.test(subscription.endpoint)).rejects.toThrow('offline');
  expect(service.deliveryStatus().pending).toBe(0);
});

it('clears pending work without resurrecting an in-flight failure and keeps later events distinct', async () => {
  const { service } = createService();
  await service.register(notificationSubscription());
  const gate = networkGate();
  vi.mocked(sendPush).mockImplementationOnce(async () => {
    await gate;
    throw new Error('offline');
  });
  service.enqueue(completedJob());
  service.clearOutbox();
  releases.splice(0).forEach((release) => release());
  await settle();
  expect(service.deliveryStatus().pending).toBe(0);
  service.enqueue(completedJob());
  await settle();
  expect(sendPush).toHaveBeenCalledTimes(TWO);
  expect(service.deliveryStatus().pending).toBe(0);
});

it('reports storage corruption without erasing the backlog or preventing station startup', async () => {
  const configuration = notificationConfiguration();
  directories.push(configuration.dataDirectory);
  new PushStore(configuration.dataDirectory);
  const filename = path.join(configuration.dataDirectory, 'notifications', 'outbox.json');
  writeFileSync(filename, '{damaged state');
  const { service } = createService(configuration);
  expect(service.configurationForBrowser().enabled).toBe(true);
  expect(service.deliveryStatus()).toMatchObject({ available: false, reason: expect.stringContaining('restart') });
  await service.register(notificationSubscription());
  service.enqueue(completedJob());
  await settle();
  expect(sendPush).not.toHaveBeenCalled();
  expect(readFileSync(filename, 'utf8')).toBe('{damaged state');
});

it('suspends on a failed persistence write without losing old memory or entering a retry loop', async () => {
  const { service, configuration } = createService();
  await service.register(notificationSubscription());
  const filename = path.join(configuration.dataDirectory, 'notifications', 'outbox.json');
  mkdirSync(`${filename}.tmp`);
  expect(() => service.enqueue(completedJob())).not.toThrow();
  expect(service.deliveryStatus().available).toBe(false);
  await vi.advanceTimersByTimeAsync(OUTBOX_LIMIT.maximumAgeMilliseconds);
  expect(sendPush).not.toHaveBeenCalled();
});

it('retains an unacknowledged attempt and retries after storage repair and restart', async () => {
  const { service, configuration } = createService();
  await service.register(notificationSubscription());
  const temporaryPath = path.join(configuration.dataDirectory, 'notifications', 'outbox.json.tmp');
  vi.mocked(sendPush).mockImplementationOnce(async () => {
    mkdirSync(temporaryPath);
  });
  service.enqueue(completedJob());
  await settle();
  expect(service.deliveryStatus().available).toBe(false);
  expect(new AlertOutbox(configuration.dataDirectory).list()[0]!.attempts).toBe(1);
  expect(sendPush).toHaveBeenCalledTimes(1);
  await service.stop();
  rmSync(temporaryPath, { recursive: true });
  const restored = createService(configuration).service;
  await vi.advanceTimersByTimeAsync(OUTBOX_LIMIT.baseRetryMilliseconds);
  expect(sendPush).toHaveBeenCalledTimes(TWO);
  expect(restored.deliveryStatus()).toMatchObject({ available: true, pending: 0 });
});

it('protects aggregate status and clearing with the existing session, JSON and origin boundary', async () => {
  vi.useRealTimers();
  const { service, configuration } = createService();
  const queue = new DownloadQueue({ ...configuration, secureCookie: false });
  await queue.stop();
  try {
    const application = createApplication({ ...configuration, secureCookie: false }, queue, service);
    const client = request.agent(application);
    await client.get(ENDPOINT).expect(HTTP_STATUS.unauthorized);
    await client.delete(ENDPOINT).send({}).expect(HTTP_STATUS.unauthorized);
    await client.post(API_PATH.session).send({ token: configuration.accessToken }).expect(HTTP_STATUS.noContent);
    const snapshot = await client.get(ENDPOINT).expect(HTTP_STATUS.ok);
    expect(snapshot.headers['cache-control']).toBe('no-store');
    expect(Object.keys(snapshot.body).sort()).toEqual([
      'available',
      'nextAttemptAt',
      'pending',
      'reason',
      'retrying',
      'sending',
    ]);
    await client.delete(ENDPOINT).set('Origin', 'https://outside.example').send({}).expect(HTTP_STATUS.forbidden);
    await client.delete(ENDPOINT).expect(HTTP_STATUS.forbidden);
    await client.delete(ENDPOINT).send({}).expect(HTTP_STATUS.noContent);
  } finally {
    await queue.stop();
    vi.useFakeTimers();
  }
});
