import { execFile, type ChildProcess, type ExecFileException } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { inspectEngine, EngineInspector, ENGINE_CHECKS } from '../server/health/engines';
import { ENGINE_STATE, HEALTH_LIMIT } from '../shared/health';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
/** Test callbacks use the same bounded UTF-8 transport as the real command. */
type VersionCallback = (error: ExecFileException | null, stdout: string, stderr: string) => void;

/**
 * Fakes one native command while allowing the real inspection and cache logic to run.
 * @param {ExecFileException | null} [error] - Native process failure.
 * @param {string} [stdout] - Controlled version output.
 */
function respond(error: ExecFileException | null = null, stdout = '2026.8.19\nextra diagnostic') {
  vi.mocked(execFile).mockImplementation((...argumentsList: unknown[]) => {
    const callback = argumentsList.at(-1) as VersionCallback;
    queueMicrotask(() => callback(error, stdout, 'private stderr must not leak'));
    return new EventEmitter() as ChildProcess;
  });
}
afterEach(() => {
  vi.mocked(execFile).mockReset();
});

it('uses only fixed local version vectors with a timeout, output cap, forceful kill and no shell', async () => {
  respond();
  const [check] = ENGINE_CHECKS;
  const result = await inspectEngine(check);
  expect(result).toMatchObject({ state: ENGINE_STATE.available, version: '2026.8.19' });
  expect(execFile).toHaveBeenCalledWith(
    check.command,
    check.arguments,
    {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: HEALTH_LIMIT.commandTimeoutMilliseconds,
      maxBuffer: HEALTH_LIMIT.maximumOutputBytes,
      killSignal: 'SIGKILL',
    },
    expect.any(Function),
  );
  expect(JSON.stringify(result)).not.toContain('private stderr');
});

it('classifies missing, failed and empty version responses without exposing native error text', async () => {
  respond(Object.assign(new Error('/private/path token=secret'), { code: 'ENOENT' }));
  const missing = await inspectEngine(ENGINE_CHECKS[0]);
  expect(missing).toMatchObject({ state: ENGINE_STATE.missing, version: null });
  expect(missing.detail).toContain('Rebuild');
  expect(JSON.stringify(missing)).not.toContain('secret');
  respond(Object.assign(new Error('Timeout'), { killed: true, code: 'ETIMEDOUT' }));
  expect((await inspectEngine(ENGINE_CHECKS[0])).state).toBe(ENGINE_STATE.unavailable);
  respond(null, '');
  expect((await inspectEngine(ENGINE_CHECKS[0])).state).toBe(ENGINE_STATE.unavailable);
});

it('removes version control characters and bounds the displayed first line', async () => {
  respond(null, `\u001b${'v'.repeat(HEALTH_LIMIT.versionCharacters + 1)}\nignored`);
  const result = await inspectEngine(ENGINE_CHECKS[0]);
  expect(result.version).toBe('v'.repeat(HEALTH_LIMIT.versionCharacters));
});

it('coalesces simultaneous requests, checks sequentially and reuses results until the cache expires', async () => {
  const now = 1;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  let firstCallback: VersionCallback | undefined;
  vi.mocked(execFile).mockImplementationOnce((...argumentsList: unknown[]) => {
    firstCallback = argumentsList.at(-1) as VersionCallback;
    return new EventEmitter() as ChildProcess;
  });
  respond();
  const inspector = new EngineInspector();
  expect(execFile).not.toHaveBeenCalled();
  const first = inspector.inspect();
  const second = inspector.inspect();
  expect(second).toBe(first);
  expect(execFile).toHaveBeenCalledTimes(1);
  firstCallback!(null, 'version', '');
  expect(await first).toHaveLength(ENGINE_CHECKS.length);
  await second;
  await inspector.inspect();
  expect(execFile).toHaveBeenCalledTimes(ENGINE_CHECKS.length);
  clock.mockReturnValue(now + HEALTH_LIMIT.cacheMilliseconds + 1);
  await inspector.inspect();
  const twoPasses = 2;
  expect(execFile).toHaveBeenCalledTimes(ENGINE_CHECKS.length * twoPasses);
});
