import { execFile, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { inspectDownloadEngine } from '../server/diagnostics/engine';
import { resolveUtility } from '../server/utilities/resolve';
import { SOURCE_TYPE } from '../shared/sources';
import type { DownloadJob } from '../shared/contracts';
import type { ServerConfig } from '../server/config';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
vi.mock('../server/utilities/resolve', () => ({ resolveUtility: vi.fn() }));
const configuration: ServerConfig = {
  port: 8080,
  accessToken: 'test-password-at-least-32-characters',
  concurrency: 1,
  maximumFileBytes: 1,
  secureCookie: false,
  publicOrigin: undefined,
  isProduction: false,
  dataDirectory: '/private/state',
  runtimeEnvironment: { PATH: '/private/bin' },
};
afterEach(() => {
  vi.mocked(execFile).mockReset();
  vi.mocked(resolveUtility).mockReset();
});

/** Runs the real inspection and command selection with controlled native command responses.
 * @param {string} targets - Simulated impersonation capability table.
 */
function commands(targets: string): void {
  vi.mocked(resolveUtility).mockReturnValue({ command: '/private/managed/yt-dlp' });
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const callback = args.at(-1) as (error: null, stdout: string, stderr: string) => void;
    const flags = args[1] as string[];
    queueMicrotask(() =>
      callback(
        null,
        flags.includes('--list-impersonate-targets') ? targets : 'version 2026.10.21 /private/native-path',
        'private-stderr-token',
      ),
    );
    return new EventEmitter() as ChildProcess;
  });
}

it('checks the active managed engine and usable browser targets without leaking native output or paths', async () => {
  commands('Chrome 131 Windows curl_cffi\nFirefox - curl_cffi (unavailable)');
  const result = await inspectDownloadEngine(
    { sourceType: SOURCE_TYPE.video } as DownloadJob,
    configuration,
    new AbortController().signal,
  );
  expect(result.find((entry) => entry.id === 'engine')).toMatchObject({
    state: 'passed',
    detail: 'Managed engine responds (2026.10.21).',
  });
  expect(result.find((entry) => entry.id === 'browser')?.state).toBe('passed');
  expect(result.find((entry) => entry.id === 'merge')?.state).toBe('passed');
  expect(execFile).toHaveBeenCalledWith(
    '/private/managed/yt-dlp',
    ['--ignore-config', '--list-impersonate-targets'],
    expect.objectContaining({ env: configuration.runtimeEnvironment, shell: false, signal: expect.any(AbortSignal) }),
    expect.any(Function),
  );
  expect(JSON.stringify(result)).not.toMatch(/private|native-path|stderr-token/);
});

it('treats unavailable target rows as missing support and limits gallery checks to gallery-dl', async () => {
  commands('Chrome - curl_cffi (unavailable)\nFirefox - curl_cffi (unavailable)');
  const video = await inspectDownloadEngine(
    { sourceType: SOURCE_TYPE.video } as DownloadJob,
    configuration,
    new AbortController().signal,
  );
  expect(video.find((entry) => entry.id === 'browser')?.state).toBe('failed');
  vi.mocked(execFile).mockClear();
  const gallery = await inspectDownloadEngine(
    { sourceType: SOURCE_TYPE.deviantart } as DownloadJob,
    configuration,
    new AbortController().signal,
  );
  expect(gallery).toHaveLength(1);
  expect(execFile).toHaveBeenCalledOnce();
  expect(vi.mocked(execFile).mock.calls[0]?.[1]).toEqual(['--config-ignore', '--version']);
});
