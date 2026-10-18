export const CONTROL = {
  path: '/api/control',
  all: 'all',
  pause: 'pause',
  resume: 'resume',
  maximumTasks: 64,
  maximumStateBytes: 131_072,
  tickMilliseconds: 1_000,
  maximumFutureMilliseconds: 31_536_000_000,
  requestTimeoutMilliseconds: 60_000,
} as const;
export type ControlAction = typeof CONTROL.pause | typeof CONTROL.resume;
export interface ScheduledControl {
  id: string;
  action: ControlAction;
  target: string;
  at: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  message: string | null;
}
export interface ControlState {
  paused: boolean;
  tasks: ScheduledControl[];
}
export const CONTROL_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;

/**
 * Requires an explicit offset and real calendar date, avoiding ambiguous local daylight-saving times.
 * @param {unknown} input - Owner-supplied RFC3339 instant.
 * @param {number} [now] - Current epoch milliseconds.
 * @returns {string} Canonical future UTC instant.
 */
export function validateControlTime(input: unknown, now = Date.now()): string {
  if (
    typeof input !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.test(
      input,
    )
  ) {
    throw new Error('Use a full timestamp with an explicit offset, such as 2026-10-20T23:00:00+03:00.');
  }
  const [year, month, day] = input.slice(0, input.indexOf('T')).split('-').map(Number);
  const calendar = new Date(Date.UTC(year!, month! - 1, day!));
  const milliseconds = Date.parse(input);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() + 1 !== month ||
    calendar.getUTCDate() !== day ||
    !Number.isFinite(milliseconds) ||
    milliseconds <= now ||
    milliseconds - now > CONTROL.maximumFutureMilliseconds
  ) {
    throw new Error('Choose a valid time in the next year.');
  }
  return new Date(milliseconds).toISOString();
}
