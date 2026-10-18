import os from 'node:os';
import { SYSTEM_LIMIT, type SystemHealth } from '../../shared/health.js';
import { readKernelField } from './kernelField.js';

/** The optional mount avoids depending on container-visible sysfs; only two fixed directories are considered. */
export const THERMAL_DIRECTORIES = ['/run/linkdock-thermal', '/sys/class/thermal/thermal_zone0'] as const;
/** CPU-specific names avoid reporting a motherboard or ambient thermal zone as CPU temperature. */
const CPU_SENSOR_TYPES = new Set(['cpu-thermal', 'cpu_thermal', 'x86_pkg_temp']);
type KernelReader = (filename: string) => Promise<string | null>;
type Temperature = SystemHealth['temperature'];
const UNAVAILABLE_TEMPERATURE: Temperature = {
  celsius: null,
  detail: 'No recognized CPU sensor is readable. Optional Raspberry Pi sensor access may help; see the setup guide.',
};

/**
 * Validates integer millidegrees without interpreting decimal, hexadecimal, suffixed or implausible values.
 * @param {string | null} input - Bounded kernel field.
 * @returns {number | null} CPU temperature in Celsius, including a valid zero, or unavailable.
 */
export function parseTemperature(input: string | null): number | null {
  if (input === null || !/^-?\d+$/u.test(input)) {
    return null;
  }
  const value = Number(input) / SYSTEM_LIMIT.millidegreesPerDegree;
  return Number.isFinite(value) && value >= SYSTEM_LIMIT.minimumCelsius && value <= SYSTEM_LIMIT.maximumCelsius
    ? value
    : null;
}

/**
 * Isolates failures of a native OS counter so an unavailable value cannot invalidate unrelated diagnostics.
 * @param {() => number} read - One native measurement.
 * @returns {number | null} Finite nonnegative measurement.
 */
function readCounter(read: () => number): number | null {
  try {
    const value = read();
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Captures OS-visible counters, leaving unsupported Windows load averages explicitly unavailable.
 * @param {Temperature} temperature - Bounded thermal result.
 * @param {NodeJS.Platform} [platform] - Runtime platform; injected only for deterministic tests.
 * @returns {SystemHealth} Point-in-time counters without hostnames, serials, addresses or paths.
 */
export function collectSystemHealth(
  temperature: Temperature,
  platform: NodeJS.Platform = process.platform,
): SystemHealth {
  const threads = readCounter(() => os.cpus().length);
  const uptime = readCounter(() => os.uptime());
  let loadAverage: SystemHealth['loadAverage'] = null;
  try {
    const values = platform === 'win32' ? [] : os.loadavg();
    if (values.length === SYSTEM_LIMIT.loadWindows && values.every((value) => Number.isFinite(value) && value >= 0)) {
      loadAverage = [values[0]!, values[1]!, values[2]!];
    }
  } catch {
    /* Keep independent counters available. */
  }
  const total = readCounter(() => os.totalmem());
  const free = readCounter(() => os.freemem());
  return {
    checkedAt: new Date().toISOString(),
    cpuThreads: threads && Number.isInteger(threads) ? threads : null,
    loadAverage,
    uptimeSeconds: uptime === null ? null : Math.floor(uptime),
    memory: {
      totalBytes: total && Number.isSafeInteger(total) ? total : null,
      freeBytes: free !== null && Number.isSafeInteger(free) && (total === null || free <= total) ? free : null,
    },
    temperature: { ...temperature },
  };
}

/** Cached single-flight sampling; a stuck kernel probe never starts a growing series of background file reads. */
export class SystemInspector {
  private cached: SystemHealth | undefined;
  private expiresAt = 0;
  private pending: Promise<SystemHealth> | undefined;
  private probeBusy = false;
  /**
   * Uses fixed native readers by default; dependency injection cannot be configured through the API.
   * @param {KernelReader} [read] - Small-field reader.
   * @param {NodeJS.Platform} [platform] - Native platform.
   */
  constructor(
    private readonly read: KernelReader = readKernelField,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}
  /**
   * Coalesces callers, caches for five seconds and bounds the wait while preserving other OS counters.
   * @returns {Promise<SystemHealth>} Actual counters or explicit unavailable values.
   */
  inspect(): Promise<SystemHealth> {
    if (this.cached && Date.now() < this.expiresAt) {
      return Promise.resolve(structuredClone(this.cached));
    }
    this.pending ??= this.sample()
      .then((snapshot) => {
        this.cached = snapshot;
        this.expiresAt = Date.now() + SYSTEM_LIMIT.cacheMilliseconds;
        return snapshot;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending.then((snapshot) => structuredClone(snapshot));
  }
  /**
   * Waits a bounded time for one physical probe, without starting overlapping probes after a timeout.
   * @returns {Promise<SystemHealth>} Independent system readings and a thermal result.
   */
  private async sample(): Promise<SystemHealth> {
    if (this.platform !== 'linux' || this.probeBusy) {
      return collectSystemHealth(UNAVAILABLE_TEMPERATURE, this.platform);
    }
    this.probeBusy = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const physical = this.readTemperature()
      .catch(() => ({ ...UNAVAILABLE_TEMPERATURE }))
      .finally(() => {
        this.probeBusy = false;
      });
    try {
      const temperature = await Promise.race([
        physical,
        new Promise<Temperature>((resolve) => {
          timeout = setTimeout(
            () =>
              resolve({
                celsius: null,
                detail: 'The CPU sensor did not respond in time. Other system readings remain available.',
              }),
            SYSTEM_LIMIT.probeTimeoutMilliseconds,
          );
        }),
      ]);
      return collectSystemHealth(temperature, this.platform);
    } finally {
      clearTimeout(timeout);
    }
  }
  /**
   * Tries an optional mounted CPU zone before the native zone; unknown sensor names are never guessed.
   * @returns {Promise<Temperature>} Recognized CPU reading without raw kernel strings or paths.
   */
  private async readTemperature(): Promise<Temperature> {
    for (const directory of THERMAL_DIRECTORIES) {
      const type = await this.read(`${directory}/type`);
      if (!type || !CPU_SENSOR_TYPES.has(type)) {
        continue;
      }
      const celsius = parseTemperature(await this.read(`${directory}/temp`));
      if (celsius !== null) {
        return { celsius, detail: 'Read from a recognized CPU thermal sensor.' };
      }
    }
    return { ...UNAVAILABLE_TEMPERATURE };
  }
}
