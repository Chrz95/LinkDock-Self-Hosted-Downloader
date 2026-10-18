import { PushDeliveryError } from './send.js';

/** Provider classifications do not retain endpoint URLs, bodies or sensitive error text. */
export const PUSH_STATUS = {
  timeout: 408,
  limited: 429,
  serverError: 500,
  lastServerError: 599,
  notFound: 404,
  gone: 410,
} as const;

/**
 * Restricts retries to network failures, timeouts, rate limiting and server failures.
 * @param {unknown} error - Safe transport failure.
 * @returns {boolean} Whether another bounded automatic attempt is useful.
 */
export function canRetryPush(error: unknown): boolean {
  return (
    !(error instanceof PushDeliveryError) ||
    error.statusCode === PUSH_STATUS.timeout ||
    error.statusCode === PUSH_STATUS.limited ||
    (error.statusCode >= PUSH_STATUS.serverError && error.statusCode <= PUSH_STATUS.lastServerError)
  );
}
