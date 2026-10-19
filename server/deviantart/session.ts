import { constants, chmodSync, closeSync, existsSync, fstatSync, lstatSync, openSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DeviantartPreferences } from '../../shared/deviantart.js';
import { safeDirectory } from '../downloads/completion/paths.js';
import { OUTPUT } from '../engines/constants.js';
import { DEVIANTART_MODE } from './constants.js';
import { validateDeviantartPreferences } from './validation.js';
import { DeviantartStore } from './store.js';
export interface DeviantartExecution {
  preferences: DeviantartPreferences;
  configFile?: string;
  cacheFile?: string;
}
/**
 * Prepares a private token-bearing config and a persistent rotation cache while the caller holds the account lock.
 * @param {string} dataDirectory - Private state mount.
 * @param {DeviantartPreferences} [savedPreferences] - Pinned job scope, independent of current station defaults.
 * @returns {Promise<DeviantartExecution & {cleanup: () => Promise<void>}>} Non-secret execution paths and cleanup.
 */
export async function prepareDeviantartSession(dataDirectory: string, savedPreferences?: DeviantartPreferences) {
  const store = new DeviantartStore(dataDirectory);
  const state = store.read();
  const preferences = validateDeviantartPreferences(savedPreferences ?? state);
  if (!state.account) {
    return { preferences, cleanup: async () => {} };
  }
  const accountDirectory = safeDirectory(path.join(store.directory, state.account.id), true);
  chmodSync(accountDirectory, DEVIANTART_MODE.directory);
  const cacheFile = path.join(accountDirectory, 'cache.sqlite3');
  if (existsSync(cacheFile) && (!lstatSync(cacheFile).isFile() || lstatSync(cacheFile).isSymbolicLink())) {
    throw new Error('DeviantArt token cache must be a private regular file.');
  }
  const flags = constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const descriptor = openSync(cacheFile, flags, DEVIANTART_MODE.file);
  try {
    if (!fstatSync(descriptor).isFile()) {
      throw new Error('DeviantArt token cache must be a private regular file.');
    }
  } finally {
    closeSync(descriptor);
  }
  chmodSync(cacheFile, DEVIANTART_MODE.file);
  const directory = await mkdtemp(path.join(path.dirname(store.directory), OUTPUT.credentialSessionPrefix));
  const configFile = path.join(directory, 'deviantart.json');
  try {
    await writeFile(
      configFile,
      JSON.stringify({
        extractor: {
          deviantart: {
            'refresh-token': state.account.refreshToken,
            ...(state.account.clientId
              ? {
                  'client-id': state.account.clientId,
                  'client-secret': state.account.clientSecret,
                }
              : {}),
            public: false,
          },
        },
      }),
      { mode: DEVIANTART_MODE.file },
    );
  } catch {
    await rm(directory, { recursive: true, force: true });
    throw new Error('The private DeviantArt session could not be prepared.');
  }
  return {
    preferences,
    configFile,
    cacheFile,
    cleanup: async () => {
      await rm(directory, { recursive: true, force: true });
    },
  };
}
