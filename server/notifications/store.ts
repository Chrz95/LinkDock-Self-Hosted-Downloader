import { ECDH, createECDH } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import webPush, { type VapidKeys } from 'web-push';
import { PUSH_LIMIT, type BrowserSubscription } from '../../shared/notifications.js';
import { parseTargetUrl } from '../security/target.js';

/** Persisted notification state is private and separate from downloadable files. */
const PUSH_FILE = { directory: 'notifications', keys: 'vapid.json', subscriptions: 'subscriptions.json' } as const;
/** Browser keys use bounded URL-safe base64. */
const BASE64_URL = /^[A-Za-z\d_-]+={0,2}$/;

/**
 * Validates a public HTTPS endpoint and real P-256/authentication key material before saving a subscription.
 * @param {unknown} input - Parsed browser JSON or persisted state.
 * @returns {BrowserSubscription} Whitelisted delivery fields.
 */
export function validateSubscription(input: unknown): BrowserSubscription {
  if (!input || typeof input !== 'object') {
    throw new Error('The browser subscription is invalid.');
  }
  const value = input as Record<string, unknown>;
  const endpoint = parseTargetUrl(value.endpoint);
  if (endpoint.protocol !== 'https:' || !value.keys || typeof value.keys !== 'object') {
    throw new Error('Push subscriptions require a public HTTPS endpoint and browser keys.');
  }
  const keys = value.keys as Record<string, unknown>;
  if (
    typeof keys.p256dh !== 'string' ||
    keys.p256dh.length > PUSH_LIMIT.maximumPublicKeyCharacters ||
    typeof keys.auth !== 'string' ||
    keys.auth.length > PUSH_LIMIT.maximumAuthCharacters ||
    !BASE64_URL.test(keys.p256dh) ||
    !BASE64_URL.test(keys.auth) ||
    Buffer.from(keys.p256dh, 'base64url').length !== PUSH_LIMIT.publicKeyBytes ||
    Buffer.from(keys.auth, 'base64url').length !== PUSH_LIMIT.authenticationBytes
  ) {
    throw new Error('The browser encryption keys are invalid.');
  }
  try {
    ECDH.convertKey(Buffer.from(keys.p256dh, 'base64url'), 'prime256v1');
  } catch {
    throw new Error('The browser public key is invalid.');
  }
  return { endpoint: endpoint.href, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/**
 * Atomically publishes private notification state, retaining the old file if a write fails.
 * @param {string} filename - Internally constructed state path.
 * @param {unknown} value - JSON-serializable state.
 */
export function savePrivateJson(filename: string, value: unknown): void {
  writeFileSync(`${filename}.tmp`, JSON.stringify(value), { mode: 0o600 });
  renameSync(`${filename}.tmp`, filename);
}

/** Private identity and bounded browser registrations, stable across Docker restarts. */
export class PushStore {
  readonly keys: VapidKeys;
  private subscriptions: BrowserSubscription[];
  private readonly subscriptionPath: string;

  /**
   * Loads the station identity only when push is explicitly configured.
   * @param {string} dataDirectory - Owner's private persistent volume.
   */
  constructor(dataDirectory: string) {
    const directory = path.join(dataDirectory, PUSH_FILE.directory);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const keysPath = path.join(directory, PUSH_FILE.keys);
    this.keys = existsSync(keysPath)
      ? (JSON.parse(readFileSync(keysPath, 'utf8')) as VapidKeys)
      : webPush.generateVAPIDKeys();
    const verifier = createECDH('prime256v1');
    if (
      !this.keys ||
      typeof this.keys !== 'object' ||
      typeof this.keys.privateKey !== 'string' ||
      typeof this.keys.publicKey !== 'string' ||
      this.keys.privateKey.length > PUSH_LIMIT.maximumPrivateKeyCharacters ||
      this.keys.publicKey.length > PUSH_LIMIT.maximumPublicKeyCharacters ||
      Buffer.from(this.keys.privateKey, 'base64url').length !== PUSH_LIMIT.privateKeyBytes
    ) {
      throw new Error('The saved notification identity is invalid. Restore it from a backup.');
    }
    verifier.setPrivateKey(Buffer.from(this.keys.privateKey, 'base64url'));
    if (verifier.getPublicKey().toString('base64url') !== this.keys.publicKey) {
      throw new Error('The saved notification keys do not match. Restore them from a backup.');
    }
    if (!existsSync(keysPath)) {
      savePrivateJson(keysPath, this.keys);
    }
    this.subscriptionPath = path.join(directory, PUSH_FILE.subscriptions);
    const saved: unknown = existsSync(this.subscriptionPath)
      ? JSON.parse(readFileSync(this.subscriptionPath, 'utf8'))
      : [];
    if (!Array.isArray(saved) || saved.length > PUSH_LIMIT.maximumDevices) {
      throw new Error('Saved browser registrations are invalid. Restore notification state from a backup.');
    }
    this.subscriptions = saved.map(validateSubscription);
  }

  /** Returns an isolated registration list. @returns {BrowserSubscription[]} Saved browser destinations. */
  list(): BrowserSubscription[] {
    return this.subscriptions.map((entry) => ({ endpoint: entry.endpoint, keys: { ...entry.keys } }));
  }

  /**
   * Adds or refreshes an owner-authorized browser after network validation.
   * @param {BrowserSubscription} subscription - Validated browser destination.
   */
  add(subscription: BrowserSubscription): void {
    const next = this.subscriptions.filter((entry) => entry.endpoint !== subscription.endpoint);
    if (next.length >= PUSH_LIMIT.maximumDevices) {
      throw new Error('The browser alert limit is reached. Disable an old device before adding another.');
    }
    next.push(subscription);
    savePrivateJson(this.subscriptionPath, next);
    this.subscriptions = next;
  }

  /**
   * Removes a disabled or expired destination, publishing the new list before exposing it in memory.
   * @param {string} endpoint - Exact saved destination.
   */
  remove(endpoint: string): void {
    const next = this.subscriptions.filter((entry) => entry.endpoint !== endpoint);
    savePrivateJson(this.subscriptionPath, next);
    this.subscriptions = next;
  }
}
