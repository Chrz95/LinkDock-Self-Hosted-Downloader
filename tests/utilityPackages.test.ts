import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import * as commands from '../server/utilities/process';
import { prepareNativeTools } from '../server/utilities/native';
import { verifyDependencies } from '../server/utilities/dependencies';
import { UtilityStore } from '../server/utilities/storage';
import { prepareUtilityRelease } from '../server/utilities/prepare';
import { LIBRARY_TRIPLE } from '../server/utilities/resolve';
import { UTILITY } from '../shared/utilities';
import { MEDIA_RUNTIME_CHECK, MEDIA_RUNTIME_READY } from '../server/utilities/mediaRuntime';

const directories: string[] = [];
const DOWNLOAD_ARGUMENT_COUNT = 3;
/** Creates update staging without touching the system package database. @returns {string} Private root. */
function directory(): string {
  const value = mkdtempSync(path.resolve('tests/.utility-packages-'));
  directories.push(value);
  return value;
}
/**
 * Emulates successful signed repository/package metadata and installer files without external network requests.
 * @returns {ReturnType<typeof vi.spyOn>} Command spy for exact authentication and argument assertions.
 */
function installCommands() {
  return vi.spyOn(commands, 'runUtilityCommand').mockImplementation(async (command, args, cwd) => {
    if (args[0] === MEDIA_RUNTIME_CHECK) {
      return MEDIA_RUNTIME_READY;
    }
    if (command === 'python3') {
      const root = args.at(-1)!;
      mkdirSync(path.join(root, 'bin'), { recursive: true });
      for (const name of ['python', 'yt-dlp', 'gallery-dl']) {
        writeFileSync(path.join(root, 'bin', name), '#!/bin/sh\n', { mode: 0o700 });
      }
    }
    if (command === 'apt-get' && args.includes('download')) {
      writeFileSync(path.join(cwd, 'aria2.deb'), 'authenticated fixture');
      writeFileSync(path.join(cwd, 'libaria2-0.deb'), 'authenticated fixture');
    }
    if (command === 'dpkg-deb' && args[0] === '--field') {
      if (args[2] === 'Package') {
        return path.basename(args[1]!, '.deb');
      }
      if (args[2] === 'Version') {
        return '1.36.0-1';
      }
      if (args[2] === 'Architecture') {
        return process.arch === 'arm64' ? 'arm64' : 'amd64';
      }
      if (args[2] === 'Depends') {
        return 'libc6 (>= 2.17)';
      }
      return '';
    }
    if (command === 'dpkg-query') {
      return '2.36';
    }
    if (command === 'dpkg-deb' && args[0] === '--extract') {
      const root = args[2]!;
      mkdirSync(path.join(root, 'usr/bin'), { recursive: true });
      mkdirSync(path.join(root, 'usr/lib', LIBRARY_TRIPLE[process.arch as keyof typeof LIBRARY_TRIPLE]), {
        recursive: true,
      });
      writeFileSync(path.join(root, 'usr/bin/aria2c'), '#!/bin/sh\n', { mode: 0o700 });
    }
    if (args.includes('--version')) {
      return 'fixture-version';
    }
    return '';
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  directories.splice(0).forEach((value) => rmSync(value, { recursive: true, force: true }));
});
it(
  'downloads only aria2/native library candidates using authenticated ' + 'signed indexes into private directories',
  async () => {
    const root = directory();
    const utilities = directory();
    const run = installCommands();
    await prepareNativeTools(root, utilities, new AbortController().signal);
    const aptCalls = run.mock.calls.filter(([command]) => command === 'apt-get');
    expect(aptCalls[0]?.[1]).toContain('Acquire::AllowInsecureRepositories=false');
    expect(aptCalls[0]?.[1]).toContain('APT::Update::Error-Mode=any');
    expect(aptCalls[1]?.[1]).toContain('APT::Get::AllowUnauthenticated=false');
    expect(aptCalls[1]?.[1].slice(-DOWNLOAD_ARGUMENT_COUNT)).toEqual(['download', 'aria2', 'libaria2-0']);
    expect(aptCalls.some(([, args]) => args.includes('install') || args.includes('upgrade'))).toBe(false);
    expect(existsSync(path.join(root, 'native/usr/bin/aria2c'))).toBe(true);
    expect(existsSync(path.join(root, 'packages'))).toBe(false);
  },
);
it('refuses native packages whose dependencies need a base image update', async () => {
  const root = directory();
  vi.spyOn(commands, 'runUtilityCommand').mockImplementation(async (command) => {
    if (command === 'dpkg-query') {
      return '2.36';
    }
    throw new Error('Dependency comparison failed');
  });
  await expect(verifyDependencies('libc6 (>= 999.0)', new Map(), root, new AbortController().signal)).rejects.toThrow(
    'image rebuild',
  );
});
it(
  'prepares Python and native tools in a stable venv path and writes ' + 'metadata only after every version passes',
  async () => {
    const data = directory();
    const store = new UtilityStore(data, false);
    const run = installCommands();
    const release = await prepareUtilityRelease(store, new AbortController().signal, () => undefined);
    const root = path.join(store.directory, 'releases', release.id);
    expect(store.state.current).toBeNull();
    expect(JSON.parse(readFileSync(path.join(root, 'release.json'), 'utf8')).id).toBe(release.id);
    const pipInstall = run.mock.calls.find(([, args]) => args.includes('install'));
    expect(pipInstall?.[0]).toBe(path.join(root, 'python/bin/python'));
    expect(pipInstall?.[1]).toContain('https://pypi.org/simple');
    expect(pipInstall?.[1]).toContain('--isolated');
    expect(pipInstall?.[1]).toContain('--only-binary=:all:');
    expect(pipInstall?.[1]).toContain('yt-dlp[default,curl-cffi]');
    expect(run.mock.calls.some(([, args]) => args[0] === MEDIA_RUNTIME_CHECK)).toBe(true);
    expect(run.mock.calls.some(([, args]) => args.includes('--config-ignore'))).toBe(true);
    expect(Object.keys(release.versions)).toHaveLength(
      Object.keys({ video: true, instagram: true, torrent: true }).length,
    );
  },
);
it('deletes a failed candidate and keeps the active pointer unchanged', async () => {
  const data = directory();
  const store = new UtilityStore(data, false);
  vi.spyOn(commands, 'runUtilityCommand').mockRejectedValue(new Error('Network unavailable'));
  await expect(prepareUtilityRelease(store, new AbortController().signal, () => undefined)).rejects.toThrow('Network');
  expect(store.state.current).toBeNull();
  expect(UTILITY.minimumFreeBytes).toBeGreaterThan(0);
});
it('rejects a candidate with no usable browser targets before checking native packages or activating it', async () => {
  const store = new UtilityStore(directory(), false);
  const run = installCommands();
  const otherwise = run.getMockImplementation()!;
  run.mockImplementation(async (...args) => (args[1][0] === MEDIA_RUNTIME_CHECK ? '' : otherwise(...args)));
  await expect(prepareUtilityRelease(store, new AbortController().signal, () => undefined)).rejects.toThrow(
    'browser support',
  );
  expect(store.state.current).toBeNull();
  expect(readdirSync(path.join(store.directory, 'releases'))).toEqual([]);
  expect(run.mock.calls.some(([command]) => command === 'apt-get')).toBe(false);
});
