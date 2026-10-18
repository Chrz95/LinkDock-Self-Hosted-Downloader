import { UTILITY } from '../../shared/utilities.js';
import { runEngineProcess } from '../engines/runProcess.js';

/**
 * Runs fixed updater arguments with bounded output, cancellation and a hard process-group timeout.
 * @param {string} command - Application-owned executable.
 * @param {string[]} args - Fixed command arguments.
 * @param {string} cwd - Private writable updater directory.
 * @param {AbortSignal} signal - Owner/shutdown cancellation.
 * @param {NodeJS.ProcessEnv} [environment] - Optional service environment and native-library override.
 * @param {number} [timeout] - Hard runtime ceiling.
 * @returns {Promise<string>} Bounded stdout for metadata/version checks.
 */
export async function runUtilityCommand(
  command: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  environment?: NodeJS.ProcessEnv,
  timeout: number = UTILITY.commandTimeoutMilliseconds,
): Promise<string> {
  let output = '';
  let diagnostic = '';
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
  try {
    await runEngineProcess(
      command,
      args,
      bounded,
      (line) => {
        output = `${output}${line}\n`.slice(-UTILITY.maximumOutputBytes);
      },
      {
        cwd,
        env: environment,
        onFailure: (text) => {
          diagnostic = text;
        },
      },
    );
  } catch (error) {
    if (bounded.aborted) {
      throw bounded.reason;
    }
    throw new Error(`Utility command failed: ${command}. ${diagnostic || 'Check executable availability.'}`, {
      cause: error,
    });
  }
  return output.trim();
}
