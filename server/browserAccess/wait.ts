import { setTimeout as delay } from 'node:timers/promises';
import { BROWSER_ACCESS } from '../../shared/browserAccess.js';

/**
 * Accepts only bounded server-advertised Retry-After delays; long waits are never silently shortened.
 * @param {string | string[] | undefined} value - Upstream Retry-After header.
 * @returns {number | null} Delay in whole seconds, or no automatic retry.
 */
export function retryAfterSeconds(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const seconds = /^\d+$/u.test(value.trim())
    ? Number(value)
    : Math.ceil((Date.parse(value) - Date.now()) / BROWSER_ACCESS.millisecondsPerSecond);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= BROWSER_ACCESS.maximumWaitSeconds ? seconds : null;
}
/**
 * Waits out a source cooldown with visible progress and immediate queue cancellation.
 * @param {number} seconds - Validated bounded source delay.
 * @param {AbortSignal} signal - Pause/cancel/shutdown.
 * @param {(seconds: number) => void} [onWait] - Safe stage callback, never raw upstream text.
 * @returns {Promise<void>} Cooldown elapsed or cancellation raised.
 */
export async function waitForSource(seconds: number, signal: AbortSignal, onWait?: (seconds: number) => void) {
  for (let remaining = seconds; remaining > 0; remaining -= 1) {
    signal.throwIfAborted();
    onWait?.(remaining);
    await delay(BROWSER_ACCESS.millisecondsPerSecond, undefined, { signal });
  }
  signal.throwIfAborted();
}
