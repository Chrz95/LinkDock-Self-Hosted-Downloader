import https from 'node:https';
import webPush, { type VapidKeys } from 'web-push';
import { PUSH_LIMIT, OUTBOX_LIMIT, type BrowserSubscription } from '../../shared/notifications.js';
import { parseTargetUrl, resolvePublicTarget } from '../security/target.js';

/** Only HTTP status is retained from a provider failure; endpoints and response bodies never enter logs. */
export class PushDeliveryError extends Error {
  /**
   * Classifies expired registrations without leaking browser destination identifiers.
   * @param {number} statusCode - Provider HTTP response status.
   * @param {number} [retryAfterMilliseconds] - Bounded provider-requested delay.
   */
  constructor(
    readonly statusCode: number,
    readonly retryAfterMilliseconds?: number,
  ) {
    super('The browser push service rejected this alert.');
  }
}

/**
 * Parses provider scheduling without retaining response headers in state.
 * @param {string | string[] | undefined} input - Delta seconds or HTTP date.
 * @param {number} now - Current epoch milliseconds.
 * @returns {number | undefined} Nonnegative bounded delay.
 */
export function parseRetryAfter(input: string | string[] | undefined, now: number): number | undefined {
  const maximumCharacters = 128;
  if (typeof input !== 'string' || input.length > maximumCharacters) {
    return undefined;
  }
  const value = input.trim();
  const httpDate = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/u;
  if (!/^\d+$/u.test(value) && !httpDate.test(value)) {
    return undefined;
  }
  const delay = /^\d+$/u.test(value) ? Number(value) * OUTBOX_LIMIT.millisecondsPerSecond : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.min(OUTBOX_LIMIT.maximumRetryMilliseconds, Math.max(0, delay)) : undefined;
}

/**
 * Bounds destination resolution before connecting to a pinned public address.
 * @param {URL} target - Validated HTTPS endpoint.
 * @returns {ReturnType<typeof resolvePublicTarget>} Checked public address.
 */
async function resolvePushTarget(target: URL): ReturnType<typeof resolvePublicTarget> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolvePublicTarget(target),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('The push service lookup timed out.')),
          PUSH_LIMIT.timeoutMilliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Uses maintained Web Push encryption with bounded, pinned HTTPS transport and no redirect following.
 * @param {BrowserSubscription} subscription - Saved, validated browser destination.
 * @param {string} payload - Generic owner-approved notification text.
 * @param {VapidKeys} keys - Private station signing identity.
 * @param {string} subject - Owner-configured VAPID contact.
 * @returns {Promise<void>} Provider accepted the encrypted request; device delivery remains best effort.
 */
export async function sendPush(subscription: BrowserSubscription, payload: string, keys: VapidKeys, subject: string) {
  const target = parseTargetUrl(subscription.endpoint);
  if (target.protocol !== 'https:') {
    throw new Error('Only HTTPS browser push services are supported.');
  }
  const destination = await resolvePushTarget(target);
  const requestDetails = webPush.generateRequestDetails(subscription, payload, {
    TTL: PUSH_LIMIT.timeToLiveSeconds,
    urgency: 'normal',
    vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
  });
  await new Promise<void>((resolve, reject) => {
    const request = https.request(
      target,
      {
        method: 'POST',
        headers: requestDetails.headers,
        agent: false,
        family: destination.family,
        lookup: (_hostname, _options, callback) => callback(null, destination.address, destination.family),
        signal: AbortSignal.timeout(PUSH_LIMIT.timeoutMilliseconds),
      },
      (response) => {
        const minimumSuccess = 200;
        const maximumSuccess = 299;
        const status = response.statusCode ?? 0;
        response.destroy();
        if (status >= minimumSuccess && status <= maximumSuccess) {
          resolve();
        } else {
          reject(new PushDeliveryError(status, parseRetryAfter(response.headers['retry-after'], Date.now())));
        }
      },
    );
    request.on('error', reject);
    request.end(requestDetails.body);
  });
}
