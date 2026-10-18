/** Fixed states describe command availability rather than source or swarm reachability. */
export const ENGINE_STATE = { available: 'available', missing: 'missing', unavailable: 'unavailable' } as const;
/** Known commands are chosen by the server and never supplied through the API. */
export interface EngineHealth {
  id: string;
  label: string;
  state: (typeof ENGINE_STATE)[keyof typeof ENGINE_STATE];
  version: string | null;
  detail: string;
  checkedAt: string;
}
/** Owner-only diagnostics contain no filesystem paths, credentials, source links or browser registrations. */
export interface StationHealthSnapshot {
  checkedAt: string;
  runtime: { node: string; platform: string; architecture: string; uptimeSeconds: number; memoryBytes: number | null };
  storage: { availableBytes: number | null; totalBytes: number | null; writable: boolean; detail: string };
  queue: { active: number; waiting: number; paused: number; holdReason: string | null };
  engines: EngineHealth[];
}
/** Expensive command checks are sequential, coalesced across requests and cached for one minute. */
export const HEALTH_LIMIT = {
  cacheMilliseconds: 60_000,
  commandTimeoutMilliseconds: 3_000,
  maximumOutputBytes: 8_192,
  versionCharacters: 160,
  secondsPerMinute: 60,
  minutesPerHour: 60,
} as const;
