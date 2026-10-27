import { execFile } from 'node:child_process';
import { resolveUtility } from '../utilities/resolve.js';
import { ENGINE_COMMAND } from '../engines/constants.js';
import { ENGINE_STATE, HEALTH_LIMIT, type EngineHealth } from '../../shared/health.js';

/** Fixed local version commands exit without querying media providers or starting the torrent daemon. */
export const ENGINE_CHECKS = [
  { id: 'video', label: 'Site videos', command: ENGINE_COMMAND.video, arguments: ['--ignore-config', '--version'] },
  {
    id: 'instagram',
    label: 'Instagram & DeviantArt galleries',
    command: ENGINE_COMMAND.instagram,
    arguments: ['--config-ignore', '--version'],
  },
  { id: 'torrent', label: 'Torrents', command: ENGINE_COMMAND.torrent, arguments: ['--no-conf=true', '--version'] },
  { id: 'merge', label: 'Video merging', command: 'ffmpeg', arguments: ['-version'] },
] as const;
/** One application-owned executable and its static arguments. */
type EngineCheck = (typeof ENGINE_CHECKS)[number];

/**
 * Caps command runtime and output while withholding raw errors, paths and stderr from API responses.
 * @param {EngineCheck} check - Fixed executable definition.
 * @param {string} [dataDirectory] - Optional managed tool state.
 * @param {NodeJS.ProcessEnv} [environment] - Existing service environment for native libraries.
 * @param {AbortSignal} [signal] - Optional diagnostic deadline and browser disconnect cancellation.
 * @returns {Promise<EngineHealth>} Sanitized point-in-time command result.
 */
export function inspectEngine(
  check: EngineCheck,
  dataDirectory?: string,
  environment?: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<EngineHealth> {
  const execution =
    dataDirectory && check.id !== 'merge'
      ? resolveUtility(check.id, dataDirectory, environment)
      : { command: check.command };
  return new Promise((resolve) => {
    execFile(
      execution.command,
      check.arguments,
      {
        encoding: 'utf8',
        env: execution.environment ?? environment,
        ...(signal ? { signal } : {}),
        shell: false,
        windowsHide: true,
        timeout: HEALTH_LIMIT.commandTimeoutMilliseconds,
        maxBuffer: HEALTH_LIMIT.maximumOutputBytes,
        killSignal: 'SIGKILL',
      },
      (error, stdout) => {
        const version =
          stdout
            .split(/\r?\n/)
            .find((line) => line.trim())
            ?.trim()
            .replace(/\p{Cc}/gu, '')
            .slice(0, HEALTH_LIMIT.versionCharacters) || null;
        const state =
          error?.code === 'ENOENT'
            ? ENGINE_STATE.missing
            : error || !version
              ? ENGINE_STATE.unavailable
              : ENGINE_STATE.available;
        resolve({
          id: check.id,
          label: check.label,
          state,
          version: state === ENGINE_STATE.available ? version : null,
          detail:
            state === ENGINE_STATE.available
              ? 'Version command passed. Source access still depends on the provider.'
              : state === ENGINE_STATE.missing
                ? 'Engine missing. Rebuild the Docker image to install the packaged tools.'
                : 'Engine check failed, timed out or exceeded its output limit. Rebuild and inspect station logs.',
          checkedAt: new Date().toISOString(),
        });
      },
    );
  });
}

/** One coalesced inspection at a time, with completed results reused across all authenticated browser requests. */
export class EngineInspector {
  /**
   * Resolves active managed binaries for the station instead of only inspecting packaged defaults.
   * @param {string} [dataDirectory] - Optional persistent utility state.
   * @param {NodeJS.ProcessEnv} [environment] - Existing service environment.
   */
  constructor(
    private readonly dataDirectory?: string,
    private readonly environment?: NodeJS.ProcessEnv,
  ) {}
  private cached: EngineHealth[] | undefined;
  private expiresAt = 0;
  private pending: Promise<EngineHealth[]> | undefined;

  /**
   * Starts sequential checks only when needed; callers cannot bypass the one-minute cache.
   * @returns {Promise<EngineHealth[]>} Recent availability results.
   */
  inspect(): Promise<EngineHealth[]> {
    if (this.cached && Date.now() < this.expiresAt) {
      return Promise.resolve(this.cached);
    }
    this.pending ??= this.run().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  /** Performs one bounded sequential pass. @returns {Promise<EngineHealth[]>} Completed engine checks. */
  private async run(): Promise<EngineHealth[]> {
    const results: EngineHealth[] = [];
    for (const check of ENGINE_CHECKS) {
      results.push(await inspectEngine(check, this.dataDirectory, this.environment));
    }
    this.cached = results;
    this.expiresAt = Date.now() + HEALTH_LIMIT.cacheMilliseconds;
    return results;
  }
}
