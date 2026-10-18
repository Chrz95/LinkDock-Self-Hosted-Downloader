import type { ServerConfig } from '../config.js';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../shared/contracts.js';
import {
  PUSH_LIMIT,
  PUSH_MESSAGE,
  type PushConfiguration,
  type BrowserSubscription,
} from '../../shared/notifications.js';
import { logger } from '../../src/lib/logger/logger.js';
import { parseTargetUrl, resolvePublicTarget } from '../security/target.js';
import { PushStore, validateSubscription } from './store.js';
import { sendPush, PushDeliveryError } from './send.js';

/** Alert categories are finite so terminal bursts coalesce instead of growing an unbounded outbox. */
type AlertKind = keyof typeof PUSH_MESSAGE;
/** Expired browser endpoints are removed after these provider responses. */
const EXPIRED_STATUS = { notFound: 404, gone: 410 };

/** Optional nonblocking, encrypted Web Push delivery for owner-registered browsers. */
export class NotificationService {
  private readonly store: PushStore | undefined;
  private readonly pending = new Set<AlertKind>();
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
    this.store.add(subscription);
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

  /**
   * Observes only future successful or failed transfers and never sends filenames or links.
   * @param {DownloadJob} job - Newly persisted terminal transition.
   */
  enqueue(job: DownloadJob): void {
    if (
      !this.store ||
      this.isStopping ||
      !this.store.list().length ||
      (job.status !== DOWNLOAD_STATUS.completed && job.status !== DOWNLOAD_STATUS.failed)
    ) {
      return;
    }
    this.pending.add(job.status);
    this.startDelivery();
  }

  /** Starts or resumes the coalescing worker without leaving a late event stranded. */
  private startDelivery(): void {
    if (this.sending || this.isStopping || !this.pending.size) {
      return;
    }
    this.sending = this.flush()
      .catch((error: unknown) => {
        logger.error('Browser alert processing failed.', error);
      })
      .finally(() => {
        this.sending = undefined;
        this.startDelivery();
      });
  }

  /**
   * Coalesces bursts by category and limits simultaneous outbound requests for Raspberry Pi resources.
   * @returns {Promise<void>} Pending categories have been attempted.
   */
  private async flush(): Promise<void> {
    while (this.pending.size && !this.isStopping) {
      const kind = this.pending.values().next().value;
      if (!kind) {
        break;
      }
      this.pending.delete(kind);
      const subscriptions = this.store?.list() ?? [];
      for (let index = 0; index < subscriptions.length && !this.isStopping; index += PUSH_LIMIT.sendConcurrency) {
        await Promise.allSettled(
          subscriptions.slice(index, index + PUSH_LIMIT.sendConcurrency).map(async (entry) => {
            try {
              await this.deliver(entry, kind);
            } catch (error) {
              logger.error('A browser alert could not be delivered.', error);
            }
          }),
        );
      }
    }
  }

  /**
   * Encrypts one generic alert and prunes expired subscriptions without retaining provider response text.
   * @param {BrowserSubscription} subscription - Saved browser.
   * @param {AlertKind} kind - Generic notification category.
   * @returns {Promise<void>} Provider acceptance.
   */
  private async deliver(subscription: BrowserSubscription, kind: AlertKind): Promise<void> {
    if (!this.store || !this.configuration.webPushSubject) {
      throw new Error('Alerts are not configured.');
    }
    try {
      await sendPush(
        subscription,
        JSON.stringify({ kind, body: PUSH_MESSAGE[kind] }),
        this.store.keys,
        this.configuration.webPushSubject,
      );
    } catch (error) {
      if (error instanceof PushDeliveryError && Object.values(EXPIRED_STATUS).includes(error.statusCode)) {
        this.store.remove(subscription.endpoint);
      }
      throw error;
    }
  }

  /**
   * Drops unsent transient alerts and waits only for currently bounded delivery attempts.
   * @returns {Promise<void>} Alert processing stopped.
   */
  async stop(): Promise<void> {
    this.isStopping = true;
    this.pending.clear();
    await this.sending;
  }
}
