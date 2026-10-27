import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_POLICY, POLICY_LIMIT, type StationPolicy } from '../../shared/policy.js';
import { validateDestination } from '../../shared/jobOptions.js';

/** Validated wall-clock input; a time window repeats daily in its explicit IANA timezone. */
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** Persisted station preference filename; no user-provided paths are accepted. */
const SETTINGS_FILENAME = 'settings.json';

/**
 * Validates a complete preference object before it can affect resource allocation or scheduling.
 * @param {unknown} input - Request body or persisted JSON.
 * @returns {StationPolicy} Whitelisted, bounded settings.
 */
export function validatePolicy(input: unknown): StationPolicy {
  if (!input || typeof input !== 'object') {
    throw new Error('Station preferences must be an object.');
  }
  const value = input as Record<string, unknown>;
  if (value.automaticRetries !== undefined && typeof value.automaticRetries !== 'boolean') {
    throw new Error('Automatic retries must be enabled or disabled.');
  }
  for (const [key, maximum] of [
    ['downloadKibPerSecond', POLICY_LIMIT.maximumRateKib],
    ['uploadKibPerSecond', POLICY_LIMIT.maximumRateKib],
    ['reserveGib', POLICY_LIMIT.maximumReserveGib],
  ] as const) {
    if (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > maximum) {
      throw new Error('Speed limits and reserved space must be whole numbers within the documented range.');
    }
  }
  if (
    typeof value.scheduleEnabled !== 'boolean' ||
    typeof value.windowStart !== 'string' ||
    !CLOCK_TIME.test(value.windowStart) ||
    typeof value.windowEnd !== 'string' ||
    !CLOCK_TIME.test(value.windowEnd) ||
    typeof value.timeZone !== 'string' ||
    value.timeZone.length > POLICY_LIMIT.maximumTimeZoneLength ||
    (value.scheduleEnabled && value.windowStart === value.windowEnd)
  ) {
    throw new Error('Choose distinct start/end times and a valid timezone for the daily download window.');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format();
  } catch {
    throw new Error('The timezone must be an IANA name such as Europe/Athens.');
  }
  return {
    automaticRetries: value.automaticRetries === undefined ? true : value.automaticRetries,
    downloadKibPerSecond: Number(value.downloadKibPerSecond),
    uploadKibPerSecond: Number(value.uploadKibPerSecond),
    reserveGib: Number(value.reserveGib),
    scheduleEnabled: value.scheduleEnabled,
    windowStart: value.windowStart,
    windowEnd: value.windowEnd,
    timeZone: value.timeZone,
    completionDirectory:
      value.completionDirectory === undefined || value.completionDirectory === null
        ? null
        : validateDestination(value.completionDirectory),
  };
}

/** Atomically stores owner preferences; invalid state fails closed instead of silently resetting. */
export class PolicyStore {
  private value: StationPolicy;
  private readonly filename: string;

  /**
   * Reads preferences from the same private data volume as queue history.
   * @param {string} dataDirectory - Existing writable station directory.
   */
  constructor(dataDirectory: string) {
    this.filename = path.join(dataDirectory, SETTINGS_FILENAME);
    this.value = existsSync(this.filename)
      ? validatePolicy(JSON.parse(readFileSync(this.filename, 'utf8')))
      : { ...DEFAULT_POLICY };
  }

  /** Returns a copy so callers cannot bypass validation. @returns {StationPolicy} Current owner preferences. */
  get settings(): StationPolicy {
    return { ...this.value };
  }

  /**
   * Persists settings before exposing them to active workers.
   * @param {unknown} input - Complete owner-submitted preferences.
   */
  update(input: unknown): void {
    const next = validatePolicy(input);
    if (input && typeof input === 'object' && !Object.hasOwn(input, 'automaticRetries')) {
      next.automaticRetries = this.value.automaticRetries;
    }
    if (input && typeof input === 'object' && !Object.hasOwn(input, 'completionDirectory')) {
      next.completionDirectory = this.value.completionDirectory;
    }
    const temporaryPath = `${this.filename}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(next), { mode: 0o600 });
    renameSync(temporaryPath, this.filename);
    this.value = next;
  }
}
