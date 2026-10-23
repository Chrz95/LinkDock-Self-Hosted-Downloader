import { MEDIA_FAILURE } from '../../shared/mediaFailures.js';
import { EngineProcessError, classifyMediaFailure } from './failures.js';
import { spawn } from 'node:child_process';
import { ENGINE_LIMIT } from './constants.js';

export interface EngineProcessOptions {
  authenticationMessage?: string;
  failure?: (diagnostic: string, exitCode: number | null) => EngineProcessError;
  onFailure?: (diagnostic: string) => void;
  onDiagnostic?: (line: string) => void;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Runs an argument vector without a shell and terminates its full Linux process group on cancellation.
 * @param {string} executable - Fixed engine command.
 * @param {string[]} argumentsList - Application-built arguments.
 * @param {AbortSignal} signal - Cancellation source.
 * @param {(line: string) => void} onLine - Receives bounded output lines for progress parsing.
 * @param {EngineProcessOptions} [options] - Private execution directory and managed native library environment.
 * @returns {Promise<void>} Successful process completion after all children have exited.
 */
export function runEngineProcess(
  executable: string,
  argumentsList: string[],
  signal: AbortSignal,
  onLine: (line: string) => void,
  options: EngineProcessOptions = {},
): Promise<void> {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, argumentsList, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options.cwd,
      env: options.env,
    });
    let errorOutput = '';
    let pendingLine = '';
    let pendingDiagnostic = '';
    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    /** Terminates the engine and subprocesses such as ffmpeg, escalating only after a grace period. */
    function handleAbort(): void {
      if (!child.pid) {
        return;
      }
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* The child may have already exited. */
      }
      killTimeout = setTimeout(() => {
        try {
          if (child.pid) {
            process.kill(-child.pid, 'SIGKILL');
          }
        } catch {
          /* Already reaped. */
        }
      }, ENGINE_LIMIT.shutdownGraceMilliseconds);
    }
    signal.addEventListener('abort', handleAbort, { once: true });
    if (signal.aborted) {
      handleAbort();
    }
    child.stdout.on('data', (chunk: Buffer) => {
      pendingLine = `${pendingLine}${chunk.toString()}`.slice(-ENGINE_LIMIT.maximumErrorCharacters);
      const lines = pendingLine.split(/\r?\n/);
      pendingLine = lines.pop() ?? '';
      lines.forEach((line) => onLine(line));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput = `${errorOutput}${chunk.toString()}`.slice(-ENGINE_LIMIT.maximumErrorCharacters);
      if (options.onDiagnostic) {
        pendingDiagnostic = `${pendingDiagnostic}${chunk.toString()}`.slice(-ENGINE_LIMIT.maximumErrorCharacters);
        const lines = pendingDiagnostic.split(/\r?\n/);
        pendingDiagnostic = lines.pop() ?? '';
        lines.forEach((line) => options.onDiagnostic?.(line));
      }
    });
    child.once('error', () => reject(new EngineProcessError(MEDIA_FAILURE.utility)));
    child.once('close', (code) => {
      if (pendingDiagnostic) {
        options.onDiagnostic?.(pendingDiagnostic);
      }
      clearTimeout(killTimeout);
      if (signal.aborted && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* All workers already exited. */
        }
      }
      signal.removeEventListener('abort', handleAbort);
      if (signal.aborted) {
        reject(signal.reason);
      } else if (code === 0) {
        if (pendingLine) {
          onLine(pendingLine);
        }
        resolve();
      } else {
        options.onFailure?.(errorOutput);
        if (options.failure) {
          reject(options.failure(errorOutput, code));
          return;
        }
        const reason = classifyMediaFailure(errorOutput);
        reject(
          new EngineProcessError(reason, reason === MEDIA_FAILURE.login ? options.authenticationMessage : undefined),
        );
      }
    });
  });
}
