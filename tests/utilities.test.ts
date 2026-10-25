import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { UtilityService } from '../server/utilities/service';
import { UtilityStore, validateUtilityState } from '../server/utilities/storage';
import { resolveUtility } from '../server/utilities/resolve';
import { runUtilityCommand } from '../server/utilities/process';
import { prepareUtilityRelease } from '../server/utilities/prepare';
import { createUtilityRelease } from './helpers/utilityFixture';
import { UTILITY } from '../shared/utilities';
import type { ServerConfig } from '../server/config';
import { logger } from '../src/lib/logger/logger';

const OLD = '05d38859-b5ef-4ef3-92cc-8459544746df';
const NEXT = 'fa45b7f1-0b7b-4f4e-8bdf-631faee37e72';
const PORT = 8_080;
const LIMIT = 1_024;
const directories: string[] = [];
const services: UtilityService[] = [];
/** Creates persistent updater state with an injectable queue gate. @returns {ServerConfig} Isolated environment. */
function configuration(): ServerConfig {
  const directory = mkdtempSync(path.resolve('tests/.utilities-'));
  directories.push(directory);
  return {
    dataDirectory: directory,
    port: PORT,
    concurrency: 1,
    maximumFileBytes: LIMIT,
    accessToken: 'utility-test-secret-not-a-real-credential',
    publicOrigin: undefined,
    secureCookie: false,
    isProduction: false,
  };
}
/**
 * Registers one updater for deterministic shutdown.
 * @param {ServerConfig} config - Runtime configuration.
 * @param {ConstructorParameters<typeof UtilityService>[1]} gate - Idle gate.
 * @param {typeof prepareUtilityRelease} prepare - Candidate factory.
 * @returns {UtilityService} Owned updater.
 */
function service(
  config: ServerConfig,
  gate: ConstructorParameters<typeof UtilityService>[1],
  prepare: typeof prepareUtilityRelease,
): UtilityService {
  const value = new UtilityService(config, gate, prepare);
  services.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(services.splice(0).map((item) => item.stop()));
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('keeps an update waiting while active downloads own the queue and restores the request after restart', async () => {
  const config = configuration();
  let busy = true;
  const prepare = vi
    .fn<typeof prepareUtilityRelease>()
    .mockImplementation(async (store) => createUtilityRelease(store.dataDirectory, NEXT, 'new'));
  const gate = vi.fn(async (work: () => Promise<void>) => {
    if (busy) {
      return false;
    }
    await work();
    return true;
  });
  const first = service(config, gate, prepare);
  first.request();
  await first.tick();
  expect(first.snapshot().status).toBe('waiting');
  expect(prepare).not.toHaveBeenCalled();
  await first.stop();
  busy = false;
  const recovered = service(config, gate, prepare);
  await recovered.tick();
  expect(recovered.snapshot()).toMatchObject({ requested: false, status: 'idle', usingManagedTools: true });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(resolveUtility('video', config.dataDirectory).command).toContain(NEXT);
});
it('retains the active release when preparation fails and withholds private diagnostics from status', async () => {
  const config = configuration();
  const prepare = vi.fn<typeof prepareUtilityRelease>().mockRejectedValue(new Error('/private/path secret-token'));
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  const value = service(
    config,
    async (work) => {
      await work();
      return true;
    },
    prepare,
  );
  const release = createUtilityRelease(config.dataDirectory, OLD, 'old');
  value.store.save({ ...value.store.state, current: OLD, versions: release.versions });
  value.request();
  await value.tick();
  expect(value.snapshot()).toMatchObject({ status: 'failed', usingManagedTools: true });
  expect(value.store.state.current).toBe(OLD);
  expect(JSON.stringify(value.snapshot())).not.toContain('secret-token');
  expect(resolveUtility('torrent', config.dataDirectory).command).toContain(OLD);
});
it('retains the old executable pointer if activation cannot be persisted', async () => {
  const config = configuration();
  const prepare = vi
    .fn<typeof prepareUtilityRelease>()
    .mockImplementation(async (store) => createUtilityRelease(store.dataDirectory, NEXT, 'new'));
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  const value = service(
    config,
    async (work) => {
      await work();
      return true;
    },
    prepare,
  );
  const release = createUtilityRelease(config.dataDirectory, OLD, 'old');
  value.store.save({ ...value.store.state, current: OLD, versions: release.versions });
  const save = value.store.save.bind(value.store);
  vi.spyOn(value.store, 'save').mockImplementation((state) => {
    if (state.current === NEXT) {
      throw new Error('Disk full');
    }
    save(state);
  });
  value.request();
  await value.tick();
  expect(value.store.state.current).toBe(OLD);
  expect(JSON.parse(readFileSync(path.join(value.store.directory, 'state.json'), 'utf8')).current).toBe(OLD);
  expect(resolveUtility('video', config.dataDirectory).command).toContain(OLD);
});
it('cancels candidate work and restores bundled tools only through the idle gate', async () => {
  const config = configuration();
  let busy = false;
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  const prepare = vi
    .fn<typeof prepareUtilityRelease>()
    .mockImplementation(
      async (_store, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    );
  const value = service(
    config,
    async (work) => {
      if (busy) {
        return false;
      }
      await work();
      return true;
    },
    prepare,
  );
  const release = createUtilityRelease(config.dataDirectory, OLD, 'old');
  value.store.save({ ...value.store.state, current: OLD, versions: release.versions, enabled: true });
  value.request();
  value.cancel();
  await value.tick();
  expect(value.snapshot()).toMatchObject({ status: 'idle', requested: false, usingManagedTools: true });
  busy = true;
  await expect(value.restoreBundled()).rejects.toThrow('Wait');
  expect(value.store.state.current).toBe(OLD);
  busy = false;
  await value.restoreBundled();
  expect(value.snapshot()).toMatchObject({ enabled: false, usingManagedTools: false });
});
it('checks automatically after startup grace, coalesces calls and respects its daily interval', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T19:00:00Z'));
  const config = configuration();
  config.autoUpdateTools = true;
  const prepare = vi
    .fn<typeof prepareUtilityRelease>()
    .mockImplementation(async (store) => createUtilityRelease(store.dataDirectory, NEXT, 'new'));
  const value = service(
    config,
    async (work) => {
      await work();
      return true;
    },
    prepare,
  );
  await value.tick();
  expect(prepare).not.toHaveBeenCalled();
  vi.setSystemTime(Date.now() + UTILITY.initialDelayMilliseconds);
  await Promise.all([value.tick(), value.tick()]);
  expect(prepare).toHaveBeenCalledTimes(1);
  await value.tick();
  expect(prepare).toHaveBeenCalledTimes(1);
});
it('falls back to bundled tools on corrupt state and rejects executable-path injection', async () => {
  const config = configuration();
  const store = new UtilityStore(config.dataDirectory, false);
  writeFileSync(path.join(store.directory, 'state.json'), JSON.stringify({ current: '../../escape' }));
  expect(resolveUtility('video', config.dataDirectory).command).toBe('yt-dlp');
  expect(() => validateUtilityState({ ...store.state, current: '../../escape' })).toThrow();
  createUtilityRelease(config.dataDirectory, OLD, 'old');
  writeFileSync(
    path.join(store.directory, 'state.json'),
    JSON.stringify({
      ...store.state,
      current: OLD,
      enabled: 'invalid',
    }),
  );
  expect(resolveUtility('video', config.dataDirectory).command).toBe('yt-dlp');
  const recovered = new UtilityStore(config.dataDirectory, true);
  expect(recovered.state.enabled).toBe(false);
});
it('captures a real child’s final stdout without requiring a newline', async () => {
  const config = configuration();
  expect(
    await runUtilityCommand(
      process.execPath,
      ['-e', "process.stdout.write('version-no-newline')"],
      config.dataDirectory,
      new AbortController().signal,
    ),
  ).toBe('version-no-newline');
});

it('falls back from a legacy managed environment that predates required browser dependencies', () => {
  const config = configuration();
  const store = new UtilityStore(config.dataDirectory, false);
  const release = createUtilityRelease(config.dataDirectory, OLD, 'legacy-version');
  const base = existsSync('/opt/media/pyvenv.cfg') ? readFileSync('/opt/media/pyvenv.cfg', 'utf8') : 'non-docker';
  release.identity = createHash('sha256')
    .update(`${path.resolve(config.dataDirectory)}:${process.platform}:${process.arch}:${base}`)
    .digest('hex');
  writeFileSync(path.join(store.directory, 'releases', OLD, 'release.json'), JSON.stringify(release));
  store.save({ ...store.state, current: OLD, versions: release.versions });
  expect(resolveUtility('video', config.dataDirectory).command).toBe('yt-dlp');
  const value = service(config, async () => false, vi.fn<typeof prepareUtilityRelease>());
  expect(value.snapshot()).toMatchObject({ usingManagedTools: false, versions: {} });
  expect(existsSync(path.join(store.directory, 'releases', OLD, 'release.json'))).toBe(true);
});

it('verifies and restores the previous managed set and disables automatic forward updates', async () => {
  const config = configuration();
  const prepare = vi
    .fn<typeof prepareUtilityRelease>()
    .mockImplementation(async (store) => createUtilityRelease(store.dataDirectory, NEXT, 'new'));
  const value = service(
    config,
    async (work) => {
      await work();
      return true;
    },
    prepare,
  );
  const old = createUtilityRelease(config.dataDirectory, OLD, 'old');
  value.store.save({ ...value.store.state, current: OLD, versions: old.versions, enabled: true });
  value.request();
  await value.tick();
  expect(value.snapshot().canRollback).toBe(true);
  await value.restorePrevious();
  expect(value.store.state.current).toBe(OLD);
  expect(value.snapshot()).toMatchObject({ enabled: false, versions: old.versions, usingManagedTools: true });
  expect(resolveUtility('video', config.dataDirectory).command).toContain(OLD);
});
