/** Station-wide transfer preferences stored on the Pi, independent of browser sessions. */
export interface StationPolicy {
  downloadKibPerSecond: number;
  uploadKibPerSecond: number;
  reserveGib: number;
  scheduleEnabled: boolean;
  windowStart: string;
  windowEnd: string;
  timeZone: string;
  completionDirectory: string | null;
}

/** Current scheduler decision displayed beside the owner's configured preferences. */
export interface PolicySnapshot {
  settings: StationPolicy;
  holdReason: string | null;
}

/** Arithmetic, validation bounds and sampling intervals for transfer policy. */
export const POLICY_LIMIT = {
  bytesPerKib: 1_024,
  maximumRateKib: 1_048_576,
  maximumReserveGib: 65_535,
  maximumTimeZoneLength: 80,
  timerMilliseconds: 5_000,
  maximumThrottleSliceMilliseconds: 250,
  minutesPerHour: 60,
} as const;

/** Defaults leave speed and time unrestricted while reserving a small filesystem buffer. */
export const DEFAULT_POLICY: StationPolicy = {
  downloadKibPerSecond: 0,
  uploadKibPerSecond: 0,
  reserveGib: 1,
  scheduleEnabled: false,
  windowStart: '23:00',
  windowEnd: '07:00',
  timeZone: 'Europe/Athens',
  completionDirectory: null,
};
