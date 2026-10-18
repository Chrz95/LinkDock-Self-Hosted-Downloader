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
  system?: SystemHealth;
}
/** OS-visible readings can describe the host or a VM and do not represent container resource limits. */
export interface SystemHealth {
  checkedAt: string;
  cpuThreads: number | null;
  loadAverage: [number, number, number] | null;
  uptimeSeconds: number | null;
  memory: { totalBytes: number | null; freeBytes: number | null };
  temperature: { celsius: number | null; detail: string };
}
/** Small cached probes have fixed locations and bounded input; no device command or shell is required. */
export const SYSTEM_LIMIT = {
  cacheMilliseconds: 5_000,
  probeTimeoutMilliseconds: 500,
  fieldBytes: 256,
  loadWindows: 3,
  loadDigits: 2,
  temperatureDigits: 1,
  millidegreesPerDegree: 1_000,
  minimumCelsius: -40,
  maximumCelsius: 150,
} as const;
/** Expensive command checks are sequential, coalesced across requests and cached for one minute. */
export const HEALTH_LIMIT = {
  cacheMilliseconds: 60_000,
  commandTimeoutMilliseconds: 3_000,
  maximumOutputBytes: 8_192,
  versionCharacters: 160,
  secondsPerMinute: 60,
  minutesPerHour: 60,
} as const;
