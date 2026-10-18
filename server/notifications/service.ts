import type { ServerConfig } from '../config.js';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../shared/contracts.js';
import {
  PUSH_LIMIT,
  PUSH_MESSAGE,
  OUTBOX_LIMIT,
  type AlertDeliveryStatus,
  type PushConfiguration,
  type BrowserSubscription,
} from '../../shared/notifications.js';
import { logger } from '../../src/lib/logger/logger.js';
import { parseTargetUrl, resolvePublicTarget } from '../security/target.js';
import { PushStore, validateSubscription } from './store.js';
import { sendPush, PushDeliveryError } from './send.js';
import { AlertOutbox, subscriptionFingerprint, type PendingAlert } from './outbox.js';
import { canRetryPush } from './retry.js';

/** Alert categories are finite so terminal bursts coalesce instead of growing an unbounded outbox. */
type AlertKind = keyof typeof PUSH_MESSAGE;
/** Expired browser endpoints are removed after these provider responses. */
const EXPIRED_STATUS = { notFound: 404, gone: 410 };

/** Optional nonblocking, encrypted Web Push delivery for owner-registered browsers. */
export class NotificationService {
  private readonly store: PushStore | undefined;
  private readonly outbox: AlertOutbox | undefined;
  private readonly timer: ReturnType<typeof setInterval> | undefined;
  private readonly active = new Set<Promise<void>>();
  private backlogUnavailable = false;
  private sending: Promise<void> | undefined;
  private isStopping = false;

  /**
   * Keeps all notification state dormant until the owner configures HTTPS and a push contact.
   * @param {ServerConfig} configuration - Validated station configuration.
   */
  constructor(private readonly configuration: ServerConfig) {
    if (
      configuration.webPushSubject &&
      configuration.secureCookie &&
      configuration.publicOrigin?.startsWith('https://')
    ) {
      this.store = new PushStore(configuration.dataDirectory);
      try {
        this.outbox = new AlertOutbox(configuration.dataDirectory);
        this.outbox.prune(this.store.list(), Date.now());
      } catch {
        this.markUnavailable();
      }
      this.timer = setInterval(() => this.startDelivery(), OUTBOX_LIMIT.sweepMilliseconds);
      this.timer.unref();
      queueMicrotask(() => this.startDelivery());
    }
  }

  /** Returns public setup data only. @returns {PushConfiguration} Browser setup information. */
  configurationForBrowser(): PushConfiguration {
    return {
      enabled: Boolean(this.store),
      publicKey: this.store?.keys.publicKey ?? null,
      reason: this.store ? null : 'Alerts need HTTPS and notification setup on your station. See the deployment guide.',
    };
  }

  /**
   * Confirms a browser is still registered after station restores or subscription expiry.
   * @param {unknown} endpoint - Current browser's delivery identifier.
   * @returns {boolean} Whether this station retains that exact registration.
   */
  has(endpoint: unknown): boolean {
    return typeof endpoint === 'string' && Boolean(this.store?.list().some((entry) => entry.endpoint === endpoint));
  }

  /**
   * Registers only an authenticated owner's valid browser and a currently public destination.
   * @param {unknown} input - PushSubscription JSON from the browser.
   * @returns {Promise<void>} Private registration persisted.
   */
  async register(input: unknown): Promise<void> {
    if (!this.store || this.isStopping) {
      throw new Error('Browser alerts are not configured on this station.');
    }
    const subscription = validateSubscription(input);
    await resolvePublicTarget(parseTargetUrl(subscription.endpoint));
    if (this.isStopping) {
      throw new Error('The station is stopping. Try again after restart.');
    }
    this.store.add(subscription);
    this.pruneRegistrations();
  }

  /**
   * Removes a browser registration without sending any network message.
   * @param {unknown} endpoint - Exact browser delivery identifier.
   */
  unregister(endpoint: unknown): void {
    if (typeof endpoint !== 'string') {
      throw new Error('Select a valid browser registration.');
    }
    this.store?.remove(endpoint);
    this.pruneRegistrations();
  }

  /**
   * Sends a test solely to an already registered browser when its owner presses the test button.
   * @param {unknown} endpoint - Current device's saved destination.
   * @returns {Promise<void>} Provider acceptance or a visible delivery error.
   */
  async test(endpoint: unknown): Promise<void> {
    const subscription = this.store?.list().find((entry) => entry.endpoint === endpoint);
    if (!subscription) {
      throw new Error('Enable alerts on this device before sending a test.');
    }
    await this.deliver(subscription, 'test');
  }

  /** Suspends retries after persistence failure without changing downloads or overwriting damaged state. */
  private markUnavailable(): void {
    this.backlogUnavailable = true;
    logger.error('The browser alert backlog is unavailable. Check station storage and restart.');
  }

  /** Removes revoked or rotated registrations from pending work before another retry. */
  private pruneRegistrations(): void {
    if (this.store && this.outbox && !this.backlogUnavailable) {
      try {
        this.outbox.prune(this.store.list(), Date.now());
      } catch {
        this.markUnavailable();
      }
    }
  }

  /**
   * Exposes aggregate scheduling state without destinations, fingerprints, keys or payloads.
   * @returns {AlertDeliveryStatus} Private station-wide snapshot; acceptance does not prove device display.
   */
  deliveryStatus(): AlertDeliveryStatus {
    this.pruneRegistrations();
    const available = Boolean(this.outbox) && !this.backlogUnavailable;
    const entries = available ? (this.outbox?.list() ?? []) : [];
    const next = entries.reduce((earliest, entry) => Math.min(earliest, entry.nextAttemptAt), Infinity);
    return {
      available,
      pending: entries.length,
      retrying: entries.filter((entry) => entry.attempts > 0).length,
      sending: this.active.size,
      nextAttemptAt: Number.isFinite(next) ? new Date(next).toISOString() : null,
      reason: available
        ? null
        : this.store
          ? 'Alert backlog unavailable. Check station storage and restart; downloads can continue.'
          : 'Set up HTTPS and browser alerts on the station first.',
    };
  }

  /** Clears queued generic alerts; requests already in progress cannot be recalled. */
  clearOutbox(): void {
    if (!this.outbox || this.backlogUnavailable) {
      throw new Error('The alert backlog is unavailable. Restart first.');
    }
    try {
      this.outbox.clear();
    } catch {
      this.markUnavailable();
      throw new Error('Pending alerts could not be cleared.');
    }
  }

  /**
   * Persists only generic terminal categories for registrations present at enqueue time.
   * @param {DownloadJob} job - Newly persisted terminal event.
   */
  enqueue(job: DownloadJob): void {
    if (
      !this.store ||
      !this.outbox ||
      this.isStopping ||
      this.backlogUnavailable ||
      (job.status !== DOWNLOAD_STATUS.completed && job.status !== DOWNLOAD_STATUS.failed)
    ) {
      return;
    }
    try {
      this.outbox.prune(this.store.list(), Date.now());
      this.outbox.enqueue(job.status, this.store.list(), Date.now());
    } catch {
      this.markUnavailable();
      return;
    }
    this.startDelivery();
  }

  /** Starts one drain only; future retries wake on the unreferenced timer rather than a busy loop. */
  private startDelivery(): void {
    if (
      this.sending ||
      this.isStopping ||
      !this.outbox ||
      this.backlogUnavailable ||
      this.active.size >= PUSH_LIMIT.sendConcurrency ||
      !this.outbox.list().some((entry) => entry.nextAttemptAt <= Date.now())
    ) {
      return;
    }
    this.sending = this.flush()
      .catch(() => this.markUnavailable())
      .finally(() => {
        this.sending = undefined;
        this.startDelivery();
      });
  }

  /**
   * Drains due entries through shared slots; the timer retains bounded retry deadlines across restarts.
   * @returns {Promise<void>} Due work is settled or the service is stopping.
   */
  private async flush(): Promise<void> {
    while (this.store && this.outbox && !this.isStopping && !this.backlogUnavailable) {
      this.outbox.prune(this.store.list(), Date.now());
      const due = this.outbox
        .list()
        .filter((entry) => entry.nextAttemptAt <= Date.now())
        .sort((first, second) => first.nextAttemptAt - second.nextAttemptAt)
        .slice(0, PUSH_LIMIT.sendConcurrency - this.active.size);
      if (!due.length) {
        break;
      }
      await Promise.allSettled(due.map((entry) => this.attempt(entry)));
    }
  }

  /**
   * Claims durably before sending and never recreates cleared, revoked or replaced work.
   * @param {PendingAlert} entry - Due alert bound to an exact registration fingerprint.
   * @returns {Promise<void>} Accepted, discarded or scheduled for bounded retry.
   */
  private async attempt(entry: PendingAlert): Promise<void> {
    try {
      const subscription = this.store?.list().find((value) => subscriptionFingerprint(value) === entry.device);
      if (!subscription || !this.outbox || this.isStopping || this.backlogUnavailable) {
        return;
      }
      const claimed = this.outbox.claim(entry.id, Date.now());
      if (!claimed) {
        return;
      }
      let accepted = false;
      let failure: unknown;
      try {
        await this.deliver(subscription, entry.kind);
        accepted = true;
      } catch (error) {
        failure = error;
      }
      if (accepted || !canRetryPush(failure) || claimed.attempts >= OUTBOX_LIMIT.maximumAttempts) {
        this.outbox.remove(entry.id);
      } else if (failure instanceof PushDeliveryError && failure.retryAfterMilliseconds !== undefined) {
        this.outbox.postpone(entry.id, failure.retryAfterMilliseconds, Date.now());
      }
    } catch {
      this.markUnavailable();
    }
  }

  /**
   * Encrypts one generic alert and prunes expired subscriptions without retaining provider response text.
   * @param {BrowserSubscription} subscription - Saved browser.
   * @param {AlertKind} kind - Generic notification category.
   * @returns {Promise<void>} Provider acceptance.
   */
  private async deliver(subscription: BrowserSubscription, kind: AlertKind): Promise<void> {
    if (!this.store || !this.configuration.webPushSubject || this.isStopping) {
      throw new Error('Alerts are not configured.');
    }
    if (this.active.size >= PUSH_LIMIT.sendConcurrency) {
      throw new Error('Alerts are busy. Try again shortly.');
    }
    const request = sendPush(
      subscription,
      JSON.stringify({ kind, body: PUSH_MESSAGE[kind] }),
      this.store.keys,
      this.configuration.webPushSubject,
    );
    this.active.add(request);
    try {
      await request;
    } catch (error) {
      if (error instanceof PushDeliveryError && Object.values(EXPIRED_STATUS).includes(error.statusCode)) {
        try {
          this.store.remove(subscription.endpoint);
          this.pruneRegistrations();
        } catch {
          this.markUnavailable();
        }
      }
      throw error;
    } finally {
      this.active.delete(request);
      this.startDelivery();
    }
  }

  /**
   * Preserves pending alerts and waits only for currently bounded delivery attempts.
   * @returns {Promise<void>} Alert processing stopped.
   */
  async stop(): Promise<void> {
    this.isStopping = true;
    clearInterval(this.timer);
    await this.sending;
    await Promise.allSettled([...this.active]);
  }
}
