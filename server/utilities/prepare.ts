import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { UTILITY, TOOL_COMMAND } from '../../shared/utilities.js';
import { savePrivateJson } from '../notifications/store.js';
import { ensureStorage } from '../policy/storage.js';
import { releaseExecution } from './resolve.js';
import { readRuntimeEnvironment } from '../config.js';
import { UtilityResources } from './resources.js';
import { runUtilityCommand } from './process.js';
import { prepareNativeTools } from './native.js';
import { utilityIdentity, type ToolRelease, type UtilityStore } from './storage.js';
import { MEDIA_RUNTIME_CHECK, MEDIA_RUNTIME_READY } from './mediaRuntime.js';

/**
 * Builds an isolated Python/native candidate at its final path so venv shebangs remain valid after activation.
 * @param {UtilityStore} store - Persistent updater state.
 * @param {AbortSignal} externalSignal - Owner/shutdown cancellation.
 * @param {(message: string) => void} progress - Safe fixed step descriptions.
 * @param {NodeJS.ProcessEnv} [environment] - Environment inherited by the native version check.
 * @returns {Promise<ToolRelease>} Fully verified candidate; active release is unchanged.
 */
export async function prepareUtilityRelease(
  store: UtilityStore,
  externalSignal: AbortSignal,
  progress: (message: string) => void,
  environment?: NodeJS.ProcessEnv,
): Promise<ToolRelease> {
  ensureStorage(store.directory, UTILITY.minimumFreeBytes);
  const id = randomUUID();
  const root = path.join(store.directory, 'releases', id);
  mkdirSync(root, { mode: 0o700 });
  const temporary = path.join(root, 'temporary');
  mkdirSync(temporary, { mode: 0o700 });
  const installerEnvironment = { ...(environment ?? readRuntimeEnvironment()), TMPDIR: temporary };
  const resources = new UtilityResources(root, store.directory, externalSignal);
  const { signal } = resources;
  try {
    progress('Preparing an isolated Python utility environment.');
    const python = path.join(root, 'python', 'bin', 'python');
    await runUtilityCommand(
      'python3',
      ['-m', 'venv', '--copies', path.join(root, 'python')],
      root,
      signal,
      installerEnvironment,
    );
    progress('Updating yt-dlp and gallery-dl from PyPI.');
    await runUtilityCommand(
      python,
      [
        '-m',
        'pip',
        '--isolated',
        '--no-input',
        '--disable-pip-version-check',
        'install',
        '--index-url',
        'https://pypi.org/simple',
        '--only-binary=:all:',
        '--no-cache-dir',
        '--upgrade',
        'yt-dlp[default,curl-cffi]',
        'gallery-dl',
      ],
      root,
      signal,
      installerEnvironment,
    );
    await runUtilityCommand(python, ['-m', 'pip', '--isolated', 'check'], root, signal, installerEnvironment);
    progress('Verifying browser support for site videos.');
    const mediaReady = await runUtilityCommand(
      python,
      [MEDIA_RUNTIME_CHECK],
      root,
      signal,
      installerEnvironment,
      UTILITY.versionTimeoutMilliseconds,
    );
    if (mediaReady !== MEDIA_RUNTIME_READY) {
      throw new Error('Candidate browser support did not pass verification.');
    }
    ensureStorage(store.directory, UTILITY.minimumFreeBytes);
    progress('Checking signed repository updates for aria2.');
    await prepareNativeTools(root, store.directory, signal, installerEnvironment);
    progress('Verifying all candidate utility commands.');
    const versions: ToolRelease['versions'] = {};
    for (const id of Object.keys(TOOL_COMMAND) as (keyof typeof TOOL_COMMAND)[]) {
      const execution = releaseExecution(store.dataDirectory, path.basename(root), id, installerEnvironment);
      const args =
        id === 'torrent'
          ? ['--no-conf=true', '--version']
          : [id === 'instagram' ? '--config-ignore' : '--ignore-config', '--version'];
      const output = await runUtilityCommand(
        execution.command,
        args,
        root,
        signal,
        execution.environment ?? installerEnvironment,
        UTILITY.versionTimeoutMilliseconds,
      );
      const version = output
        .split(/\r?\n/u)
        .find((line) => line.trim())
        ?.trim()
        .replace(/\p{Cc}/gu, '');
      if (!version || version.length > UTILITY.maximumVersionCharacters) {
        throw new Error('Invalid tool version.');
      }
      versions[id] = version;
    }
    await resources.stop();
    signal.throwIfAborted();
    rmSync(temporary, { recursive: true, force: true });
    const release = { id, identity: utilityIdentity(store.dataDirectory), versions };
    savePrivateJson(path.join(root, 'release.json'), release);
    return release;
  } catch (error) {
    await resources.stop();
    rmSync(root, { recursive: true, force: true });
    throw error;
  } finally {
    await resources.stop();
  }
}
