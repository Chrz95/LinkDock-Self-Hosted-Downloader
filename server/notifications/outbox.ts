import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { DOWNLOAD_STATUS } from '../../shared/contracts.js';
import { OUTBOX_LIMIT, type BrowserSubscription, type TerminalAlertKind } from '../../shared/notifications.js';
import { savePrivateJson } from './store.js';

/** No source, job identifier, subscription endpoint or encryption key is duplicated in the outbox. */
export interface PendingAlert {
  id: string;
  device: string;
  kind: TerminalAlertKind;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
}
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const FINGERPRINT = /^[\da-f]{64}$/;

/**
 * Binds pending work to an exact browser registration, including key rotation at a reused endpoint.
 * @param {BrowserSubscription} subscription - Canonical private registration.
 * @returns {string} Non-reversible registration fingerprint.
 */
export function subscriptionFingerprint(subscription: BrowserSubscription): string {
  return createHash('sha256')
    .update(JSON.stringify([subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]))
    .digest('hex');
}

/**
 * Validates a complete small persisted backlog before allowing any destination lookup or delivery.
 * @param {unknown} input - Parsed private outbox file.
 * @returns {PendingAlert[]} Isolated, canonical pending records.
 */
export function validateOutbox(input: unknown): PendingAlert[] {
  if (!Array.isArray(input) || input.length > OUTBOX_LIMIT.maximumEntries) {
    throw new Error('The saved alert backlog is invalid.');
  }
  const ids = new Set<string>();
  const pairs = new Set<string>();
  return input.map((value: unknown) => {
    if (!value || typeof value !== 'object') {
      throw new Error('The saved alert backlog is invalid.');
    }
    const record = value as Record<string, unknown>;
    const { id, device, kind, createdAt, attempts, nextAttemptAt } = record;
    if (
      typeof id !== 'string' ||
      !UUID.test(id) ||
      typeof device !== 'string' ||
      !FINGERPRINT.test(device) ||
      (kind !== DOWNLOAD_STATUS.completed && kind !== DOWNLOAD_STATUS.failed) ||
      typeof createdAt !== 'number' ||
      !Number.isSafeInteger(createdAt) ||
      createdAt < 0 ||
      !Number.isFinite(new Date(createdAt).getTime()) ||
      typeof attempts !== 'number' ||
      !Number.isSafeInteger(attempts) ||
      attempts < 0 ||
      attempts > OUTBOX_LIMIT.maximumAttempts ||
      typeof nextAttemptAt !== 'number' ||
      !Number.isSafeInteger(nextAttemptAt) ||
      !Number.isFinite(new Date(nextAttemptAt).getTime()) ||
      nextAttemptAt < createdAt ||
      nextAttemptAt - createdAt > OUTBOX_LIMIT.maximumAgeMilliseconds ||
      ids.has(id) ||
      pairs.has(`${device}:${kind}`)
    ) {
      throw new Error('The saved alert backlog is invalid.');
    }
    ids.add(id);
    pairs.add(`${device}:${kind}`);
    return { id, device, kind, createdAt, attempts, nextAttemptAt };
  });
}

/** Atomic private retry state, coalesced to one record per category per exact device registration. */
export class AlertOutbox {
  private entries: PendingAlert[];
  private readonly filename: string;
  /**
   * Reads bounded persisted state only after the signing store has created the private directory.
   * @param {string} dataDirectory - Existing owner-controlled volume.
   */
  constructor(dataDirectory: string) {
    this.filename = path.join(dataDirectory, 'notifications', 'outbox.json');
    if (existsSync(this.filename) && statSync(this.filename).size > OUTBOX_LIMIT.maximumBytes) {
      throw new Error('The saved alert backlog is too large.');
    }
    this.entries = existsSync(this.filename) ? validateOutbox(JSON.parse(readFileSync(this.filename, 'utf8'))) : [];
  }
  /** Returns an isolated bounded backlog. @returns {PendingAlert[]} Pending generic deliveries. */
  list(): PendingAlert[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
  /**
   * Writes before exposing changes, preserving both memory and the old file on persistence failure.
   * @param {PendingAlert[]} entries - Complete replacement backlog.
   */
  private commit(entries: PendingAlert[]): void {
    savePrivateJson(this.filename, entries);
    this.entries = entries;
  }
  /**
   * Coalesces a terminal event for only the browsers registered at enqueue time, including in-flight entries.
   * @param {TerminalAlertKind} kind - Generic completed or failed category.
   * @param {BrowserSubscription[]} subscriptions - Exact current registrations.
   * @param {number} now - Current epoch milliseconds.
   */
  enqueue(kind: TerminalAlertKind, subscriptions: BrowserSubscription[], now: number): void {
    const next = this.list();
    for (const subscription of subscriptions) {
      const device = subscriptionFingerprint(subscription);
      if (!next.some((entry) => entry.device === device && entry.kind === kind)) {
        next.push({ id: randomUUID(), device, kind, createdAt: now, attempts: 0, nextAttemptAt: now });
      }
    }
    if (next.length > OUTBOX_LIMIT.maximumEntries) {
      throw new Error('The alert backlog limit was reached.');
    }
    if (next.length !== this.entries.length) {
      this.commit(next);
    }
  }
  /**
   * Removes stale, exhausted and revoked work without extending expiry when new events coalesce.
   * @param {BrowserSubscription[]} subscriptions - Registrations still authorized for delivery.
   * @param {number} now - Current epoch milliseconds.
   */
  prune(subscriptions: BrowserSubscription[], now: number): void {
    const allowed = new Set(subscriptions.map(subscriptionFingerprint));
    const next = this.entries.filter(
      (entry) =>
        allowed.has(entry.device) &&
        now - entry.createdAt < OUTBOX_LIMIT.maximumAgeMilliseconds &&
        (entry.attempts < OUTBOX_LIMIT.maximumAttempts || entry.nextAttemptAt > now),
    );
    if (next.length !== this.entries.length) {
      this.commit(next);
    }
  }
  /**
   * Persists an attempt and its next backoff before starting any network request, including after a crash.
   * @param {string} id - Due entry captured by the single worker.
   * @param {number} now - Current epoch milliseconds.
   * @returns {PendingAlert | undefined} Claimed record or no longer eligible work.
   */
  claim(id: string, now: number): PendingAlert | undefined {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (
      !entry ||
      entry.nextAttemptAt > now ||
      entry.attempts >= OUTBOX_LIMIT.maximumAttempts ||
      now - entry.createdAt >= OUTBOX_LIMIT.maximumAgeMilliseconds
    ) {
      return undefined;
    }
    const delay = Math.min(
      OUTBOX_LIMIT.maximumRetryMilliseconds,
      OUTBOX_LIMIT.baseRetryMilliseconds * OUTBOX_LIMIT.backoffMultiplier ** entry.attempts,
    );
    const next = {
      ...entry,
      attempts: entry.attempts + 1,
      nextAttemptAt: Math.min(entry.createdAt + OUTBOX_LIMIT.maximumAgeMilliseconds, now + delay),
    };
    this.commit(this.entries.map((candidate) => (candidate.id === id ? next : candidate)));
    return { ...next };
  }
  /**
   * Acknowledges one accepted/permanent-failure entry without touching a later replacement.
   * @param {string} id - Attempted record ID.
   */
  remove(id: string): void {
    const next = this.entries.filter((entry) => entry.id !== id);
    if (next.length !== this.entries.length) {
      this.commit(next);
    }
  }
  /**
   * Honors a longer provider delay without allowing an unbounded sleep or extending the alert's expiry.
   * @param {string} id - Retried record ID.
   * @param {number} delay - Bounded provider-requested milliseconds.
   * @param {number} now - Current epoch milliseconds.
   */
  postpone(id: string, delay: number, now: number): void {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) {
      return;
    }
    const nextAttemptAt = Math.max(
      entry.nextAttemptAt,
      Math.min(
        entry.createdAt + OUTBOX_LIMIT.maximumAgeMilliseconds,
        now + Math.min(delay, OUTBOX_LIMIT.maximumRetryMilliseconds),
      ),
    );
    if (nextAttemptAt !== entry.nextAttemptAt) {
      this.commit(this.entries.map((candidate) => (candidate.id === id ? { ...entry, nextAttemptAt } : candidate)));
    }
  }
  /** Clears only queued state; requests already in progress cannot be recalled. */
  clear(): void {
    this.commit([]);
  }
}
