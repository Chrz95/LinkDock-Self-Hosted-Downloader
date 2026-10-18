import { existsSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { AlertOutbox, subscriptionFingerprint, validateOutbox } from '../server/notifications/outbox';
import { PushStore } from '../server/notifications/store';
import { parseRetryAfter, PushDeliveryError } from '../server/notifications/send';
import { canRetryPush, PUSH_STATUS } from '../server/notifications/retry';
import { HTTP_STATUS } from '../shared/contracts';
import { OUTBOX_LIMIT, PUSH_LIMIT } from '../shared/notifications';
import { DOWNLOAD_STATUS } from '../shared/contracts';
import { notificationConfiguration, notificationSubscription } from './helpers/notificationFixture';

const directories: string[] = [];
const NOW = Date.parse('2026-10-18T12:00:00Z');
const TWO = 2;
const UNAVAILABLE_STATUS = 503;
const REDIRECT_STATUS = 301;
/** Creates a private managed directory and outbox. @returns {object} Isolated persistence fixture. */
function createOutbox() {
  const configuration = notificationConfiguration();
  directories.push(configuration.dataDirectory);
  new PushStore(configuration.dataDirectory);
  const outbox = new AlertOutbox(configuration.dataDirectory);
  const filename = path.join(configuration.dataDirectory, 'notifications', 'outbox.json');
  return { outbox, filename, directory: configuration.dataDirectory };
}
afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

it('coalesces categories per exact device and persists only fingerprints with private permissions', () => {
  const { outbox, filename, directory } = createOutbox();
  const subscriptions = Array.from({ length: PUSH_LIMIT.maximumDevices }, (_, i) =>
    notificationSubscription(`https://push.example/${i}`),
  );
  for (const kind of [DOWNLOAD_STATUS.completed, DOWNLOAD_STATUS.failed]) {
    outbox.enqueue(kind, subscriptions, NOW);
    outbox.enqueue(kind, subscriptions, NOW + 1);
  }
  expect(outbox.list()).toHaveLength(OUTBOX_LIMIT.maximumEntries);
  const restored = new AlertOutbox(directory);
  expect(restored.list()).toEqual(outbox.list());
  expect(readFileSync(filename, 'utf8')).not.toContain('https://');
  expect(readFileSync(filename, 'utf8')).not.toContain(subscriptions[0]!.keys.auth);
  const permissionsMask = 0o777;
  const ownerOnly = 0o600;
  expect(statSync(filename).mode & permissionsMask).toBe(ownerOnly);
  const copy = restored.list();
  copy[0]!.attempts = TWO;
  expect(restored.list()[0]!.attempts).toBe(0);
  expect(() =>
    restored.enqueue(DOWNLOAD_STATUS.completed, [notificationSubscription('https://push.example/extra')], NOW),
  ).toThrow('limit');
});

it('claims before delivery, persists backoff and honors a bounded longer provider delay', () => {
  const { outbox, directory } = createOutbox();
  const subscription = notificationSubscription();
  outbox.enqueue(DOWNLOAD_STATUS.completed, [subscription], NOW);
  const { id } = outbox.list()[0]!;
  expect(outbox.claim(id, NOW)).toMatchObject({ attempts: 1, nextAttemptAt: NOW + OUTBOX_LIMIT.baseRetryMilliseconds });
  expect(new AlertOutbox(directory).list()[0]!.attempts).toBe(1);
  expect(outbox.claim(id, NOW)).toBeUndefined();
  outbox.postpone(id, OUTBOX_LIMIT.maximumAgeMilliseconds, NOW);
  expect(outbox.list()[0]!.nextAttemptAt).toBe(NOW + OUTBOX_LIMIT.maximumRetryMilliseconds);
  expect(outbox.claim(id, NOW + OUTBOX_LIMIT.maximumRetryMilliseconds)?.attempts).toBe(TWO);
  outbox.remove(id);
  expect(new AlertOutbox(directory).list()).toEqual([]);
});

it('expires without refreshing age and prunes revoked registrations or rotated keys at the same endpoint', () => {
  const { outbox } = createOutbox();
  const subscription = notificationSubscription();
  outbox.enqueue(DOWNLOAD_STATUS.completed, [subscription], NOW);
  outbox.enqueue(DOWNLOAD_STATUS.completed, [subscription], NOW + 1);
  expect(outbox.list()[0]!.createdAt).toBe(NOW);
  outbox.prune([subscription], NOW + OUTBOX_LIMIT.maximumAgeMilliseconds);
  expect(outbox.list()).toEqual([]);
  outbox.enqueue(DOWNLOAD_STATUS.failed, [subscription], NOW);
  const rotated = notificationSubscription(subscription.endpoint);
  expect(subscriptionFingerprint(rotated)).not.toBe(subscriptionFingerprint(subscription));
  outbox.prune([rotated], NOW);
  expect(outbox.list()).toEqual([]);
  outbox.enqueue(DOWNLOAD_STATUS.failed, [rotated], NOW);
  outbox.prune([], NOW);
  expect(outbox.list()).toEqual([]);
});

it('retains memory and old durable state after a real atomic-write failure', () => {
  const { outbox, filename, directory } = createOutbox();
  const subscription = notificationSubscription();
  outbox.enqueue(DOWNLOAD_STATUS.completed, [subscription], NOW);
  const before = outbox.list();
  mkdirSync(`${filename}.tmp`);
  expect(() => outbox.claim(before[0]!.id, NOW)).toThrow();
  expect(outbox.list()).toEqual(before);
  expect(new AlertOutbox(directory).list()).toEqual(before);
  expect(existsSync(filename)).toBe(true);
});

it('rejects oversized, duplicated and invalid durable state without silently clearing the file', () => {
  const { outbox, filename, directory } = createOutbox();
  outbox.enqueue(DOWNLOAD_STATUS.completed, [notificationSubscription()], NOW);
  const entry = outbox.list()[0]!;
  for (const input of [
    null,
    [entry, entry],
    [{ ...entry, kind: 'test' }],
    [{ ...entry, device: 'endpoint' }],
    [{ ...entry, attempts: OUTBOX_LIMIT.maximumAttempts + 1 }],
    [{ ...entry, createdAt: -1 }],
    [{ ...entry, nextAttemptAt: Number.MAX_SAFE_INTEGER }],
    [{ ...entry, nextAttemptAt: NOW - 1 }],
  ]) {
    expect(() => validateOutbox(input)).toThrow();
  }
  writeFileSync(filename, ' '.repeat(OUTBOX_LIMIT.maximumBytes + 1));
  expect(() => new AlertOutbox(directory)).toThrow('large');
  expect(statSync(filename).size).toBe(OUTBOX_LIMIT.maximumBytes + 1);
});

it.each([
  PUSH_STATUS.timeout,
  PUSH_STATUS.limited,
  PUSH_STATUS.serverError,
  UNAVAILABLE_STATUS,
  PUSH_STATUS.lastServerError,
])('retries transient provider response %s', (status) => {
  expect(canRetryPush(new PushDeliveryError(status))).toBe(true);
});
it.each([
  REDIRECT_STATUS,
  HTTP_STATUS.badRequest,
  HTTP_STATUS.unauthorized,
  HTTP_STATUS.forbidden,
  HTTP_STATUS.notFound,
  PUSH_STATUS.gone,
  HTTP_STATUS.tooLarge,
])('does not retry permanent response %s', (status) => {
  expect(canRetryPush(new PushDeliveryError(status))).toBe(false);
});
it('retries transport failures and parses only bounded seconds or standard HTTP dates', () => {
  expect(canRetryPush(new Error('network unavailable'))).toBe(true);
  const seconds = 120;
  expect(parseRetryAfter(String(seconds), NOW)).toBe(seconds * OUTBOX_LIMIT.millisecondsPerSecond);
  expect(parseRetryAfter(new Date(NOW + OUTBOX_LIMIT.baseRetryMilliseconds).toUTCString(), NOW)).toBe(
    OUTBOX_LIMIT.baseRetryMilliseconds,
  );
  expect(parseRetryAfter('999999999', NOW)).toBe(OUTBOX_LIMIT.maximumRetryMilliseconds);
  for (const input of [undefined, '1.5', '-1', 'not a date', ['120']]) {
    expect(parseRetryAfter(input, NOW)).toBeUndefined();
  }
});
