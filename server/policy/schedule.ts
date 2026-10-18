import { POLICY_LIMIT, type StationPolicy } from '../../shared/policy.js';

/**
 * Evaluates same-day and overnight windows in their configured timezone, including DST transitions.
 * @param {StationPolicy} policy - Validated preferences.
 * @param {Date} [now] - Instant to evaluate, supplied by tests or the scheduler clock.
 * @returns {boolean} Whether source downloads may run now; end is exclusive.
 */
export function isWindowOpen(policy: StationPolicy, now = new Date()): boolean {
  if (!policy.scheduleEnabled) {
    return true;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: policy.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const current =
    Number(parts.find((part) => part.type === 'hour')?.value) * POLICY_LIMIT.minutesPerHour +
    Number(parts.find((part) => part.type === 'minute')?.value);
  const start = clockMinutes(policy.windowStart);
  const end = clockMinutes(policy.windowEnd);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/**
 * Converts a validated 24-hour clock value into minutes since local midnight.
 * @param {string} value - HH:mm preference.
 * @returns {number} Wall-clock minute index.
 */
function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * POLICY_LIMIT.minutesPerHour + (minutes ?? 0);
}
