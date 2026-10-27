import { execFile } from 'node:child_process';
import { SOURCE_TYPE, isGallerySource } from '../../shared/sources.js';
import type { DownloadJob } from '../../shared/contracts.js';
import type { DiagnosticCheck } from '../../shared/diagnostics.js';
import { ENGINE_STATE, HEALTH_LIMIT } from '../../shared/health.js';
import { ENGINE_CHECKS, inspectEngine } from '../health/engines.js';
import { resolveUtility } from '../utilities/resolve.js';
import type { ServerConfig } from '../config.js';

/** Inspects the exact active video engine using a local command, never a provider request.
 * @param {ServerConfig} configuration - Managed engine selection.
 * @param {AbortSignal} signal - Whole diagnostic cancellation.
 * @returns {Promise<boolean>} Whether at least one browser impersonation target is usable.
 */
function browserSupport(configuration: ServerConfig, signal: AbortSignal): Promise<boolean> {
  const execution = resolveUtility('video', configuration.dataDirectory, configuration.runtimeEnvironment);
  return new Promise((resolve) => {
    execFile(
      execution.command,
      ['--ignore-config', '--list-impersonate-targets'],
      {
        env: execution.environment ?? configuration.runtimeEnvironment,
        signal,
        encoding: 'utf8',
        shell: false,
        timeout: HEALTH_LIMIT.commandTimeoutMilliseconds,
        maxBuffer: HEALTH_LIMIT.maximumOutputBytes,
        killSignal: 'SIGKILL',
      },
      (error, stdout) =>
        resolve(
          !error &&
            stdout
              .split(/\r?\n/u)
              .some((line) => /^\s*(?:Chrome|Edge|Firefox|Safari|Tor)\s+/iu.test(line) && !/unavailable/iu.test(line)),
        ),
    );
  });
}

/** Reports engine availability and capabilities without exposing executable paths or native output.
 * @param {DownloadJob} job - Source engine selection.
 * @param {ServerConfig} configuration - Active utility environment.
 * @param {AbortSignal} signal - Overall cancellation.
 * @returns {Promise<DiagnosticCheck[]>} Fixed capability explanations.
 */
export async function inspectDownloadEngine(
  job: DownloadJob,
  configuration: ServerConfig,
  signal: AbortSignal,
): Promise<DiagnosticCheck[]> {
  if (!job.sourceType || job.sourceType === SOURCE_TYPE.direct) {
    return [
      { id: 'engine', label: 'Download engine', state: 'info', detail: 'Direct files use the built-in HTTP worker.' },
    ];
  }
  const id = isGallerySource(job.sourceType) ? 'instagram' : 'video';
  const check = ENGINE_CHECKS.find((entry) => entry.id === id)!;
  const health = await inspectEngine(check, configuration.dataDirectory, configuration.runtimeEnvironment, signal);
  const execution = resolveUtility(id, configuration.dataDirectory, configuration.runtimeEnvironment);
  const managed = execution.command !== check.command;
  const version = health.version?.match(/\b\d+(?:[.-]\d+){1,4}\b/u)?.[0];
  const available = health.state === ENGINE_STATE.available;
  const checks: DiagnosticCheck[] = [
    {
      id: 'engine',
      label: 'Download engine',
      state: available ? 'passed' : 'failed',
      detail: available
        ? `${managed ? 'Managed' : 'Bundled'} engine responds${version ? ` (${version})` : ''}.`
        : 'The active engine is missing or failed its local check. Review utility updates or rebuild the image.',
      action: 'settings',
    },
  ];
  if (available && id === 'video' && !signal.aborted) {
    const supported = await browserSupport(configuration, signal);
    checks.push({
      id: 'browser',
      label: 'Engine browser support',
      state: supported ? 'passed' : 'failed',
      detail: supported
        ? 'At least one browser impersonation target is usable. Source acceptance is not guaranteed.'
        : 'No usable browser target was reported. Update utilities or rebuild the latest image.',
      action: 'settings',
    });
    const merge = await inspectEngine(
      ENGINE_CHECKS.find((entry) => entry.id === 'merge')!,
      configuration.dataDirectory,
      configuration.runtimeEnvironment,
      signal,
    );
    checks.push({
      id: 'merge',
      label: 'Audio and video processing',
      state: merge.state === ENGINE_STATE.available ? 'passed' : 'failed',
      detail:
        merge.state === ENGINE_STATE.available
          ? 'ffmpeg responds to its local check.'
          : 'ffmpeg is unavailable. Merging and MP3 conversion may fail; rebuild the image.',
      action: 'settings',
    });
  }
  return checks;
}
