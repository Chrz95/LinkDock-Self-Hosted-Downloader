import { spawn } from 'node:child_process';
import { ENGINE_LIMIT } from './constants.js';

/**
 * Runs an argument vector without a shell and terminates its full Linux process group on cancellation.
 * @param {string} executable - Fixed engine command.
 * @param {string[]} argumentsList - Application-built arguments.
 * @param {AbortSignal} signal - Cancellation source.
 * @param {(line: string) => void} onLine - Receives bounded output lines for progress parsing.
 * @returns {Promise<void>} Successful process completion after all children have exited.
 */
export function runEngineProcess(
  executable: string,
  argumentsList: string[],
  signal: AbortSignal,
  onLine: (line: string) => void,
): Promise<void> {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, argumentsList, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let errorOutput = '';
    let pendingLine = '';
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
    });
    child.once('error', () => reject(new Error('This download engine is unavailable. Rebuild the Docker image.')));
    child.once('close', (code) => {
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
        resolve();
      } else {
        const needsLogin = /login|log in|sign in|cookies|authentication|private|age.restrict|bot/i.test(errorOutput);
        reject(
          new Error(
            needsLogin
              ? 'This source needs a valid login cookie file. See the connection guide.'
              : 'The source could not be downloaded. Check the link, source availability and engine updates.',
          ),
        );
      }
    });
  });
}
