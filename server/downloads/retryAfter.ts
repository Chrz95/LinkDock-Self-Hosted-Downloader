import { DOWNLOAD_RETRY } from '../../shared/downloadRetry.js';

const DATE_PART = { century: 100, futureYears: 50, shortDayLength: 3, dayLength: 2 } as const;
const LONG_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Accepts HTTP date syntax in UTC without letting permissive Date.parse accept negative/decimal delays as dates.
 * @param {string} text - Bounded, trimmed Retry-After field.
 * @returns {number} Exact UTC timestamp, or NaN for an invalid date.
 */
function httpDate(text: string): number {
  let normalized = text;
  const obsolete = /^([A-Za-z]+), (\d{2})-([A-Za-z]{3})-(\d{2}) (\d{2}:\d{2}:\d{2}) GMT$/u.exec(text);
  const asctime = /^([A-Za-z]{3}) ([A-Za-z]{3}) ( \d|\d{2}) (\d{2}:\d{2}:\d{2}) (\d{4})$/u.exec(text);
  if (obsolete) {
    if (!LONG_DAYS.includes(obsolete[1]!)) {
      return NaN;
    }
    const currentYear = new Date(Date.now()).getUTCFullYear();
    let year = Math.floor(currentYear / DATE_PART.century) * DATE_PART.century + Number(obsolete[4]);
    if (year - currentYear > DATE_PART.futureYears) {
      year -= DATE_PART.century;
    }
    normalized =
      `${obsolete[1]!.slice(0, DATE_PART.shortDayLength)}, ${obsolete[2]} ${obsolete[3]} ${year} ` +
      `${obsolete[5]} GMT`;
  } else if (asctime) {
    normalized =
      `${asctime[1]}, ${asctime[3]!.trim().padStart(DATE_PART.dayLength, '0')} ${asctime[2]} ` +
      `${asctime[5]} ${asctime[4]} GMT`;
  }
  if (!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/u.test(normalized)) {
    return NaN;
  }
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) && new Date(timestamp).toUTCString() === normalized ? timestamp : NaN;
}

/** Parses provider seconds or any HTTP-date form without shortening waits or retaining response text.
 * @param {string | string[] | undefined} value - Retry-After field from a guarded response.
 * @returns {number | null | undefined} Absolute deadline, invalid value, or absent header.
 */
export function sourceRetryAfter(value: string | string[] | undefined): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length > DOWNLOAD_RETRY.maximumHeaderCharacters) {
    return null;
  }
  const text = value.trim();
  const parsed = /^\d+$/u.test(text)
    ? Date.now() + Number(text) * DOWNLOAD_RETRY.millisecondsPerSecond
    : httpDate(text);
  return Number.isFinite(parsed) && Number.isFinite(new Date(parsed).getTime()) ? Math.max(Date.now(), parsed) : null;
}
