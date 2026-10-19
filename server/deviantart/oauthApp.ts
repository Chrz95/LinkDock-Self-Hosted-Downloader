import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { DEVIANTART } from '../../shared/deviantart.js';
import { DEVIANTART_MODE } from './constants.js';
import { DeviantartStore } from './store.js';
import { validateDeviantartCredentials } from './validation.js';
export interface DeviantartOAuthApp {
  clientId: string;
  clientSecret: string;
}
/**
 * Validates a confidential app independently of any existing user grant.
 * @param {unknown} input - Owner-provided app setup or private stored state.
 * @returns {DeviantartOAuthApp} Bounded credentials for fixed DeviantArt endpoints only.
 */
export function validateOAuthApp(input: unknown): DeviantartOAuthApp {
  const value = input as Partial<DeviantartOAuthApp> | null;
  const account = validateDeviantartCredentials({
    refreshToken: 'app-validation',
    clientId: value?.clientId,
    clientSecret: value?.clientSecret,
  });
  if (!account.clientId) {
    throw new Error('Enter the client ID and secret of a confidential DeviantArt application.');
  }
  return { clientId: account.clientId, clientSecret: account.clientSecret };
}
/**
 * Loads private app setup, reusing a previously imported custom application's credentials when available.
 * @param {string} dataDirectory - Private station state mount.
 * @returns {DeviantartOAuthApp | null} Confidential app credentials, never browser metadata.
 */
export function readOAuthApp(dataDirectory: string): DeviantartOAuthApp | null {
  const store = new DeviantartStore(dataDirectory);
  const filename = path.join(store.directory, 'oauth-app.json');
  if (!existsSync(filename)) {
    const { account } = store.read();
    return account?.clientId ? validateOAuthApp(account) : null;
  }
  const info = lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > DEVIANTART.maximumStateBytes) {
    throw new Error('DeviantArt app setup is unreadable. Save the app setup again.');
  }
  try {
    const app = validateOAuthApp(JSON.parse(readFileSync(filename, 'utf8')));
    chmodSync(filename, DEVIANTART_MODE.file);
    return app;
  } catch {
    throw new Error('DeviantArt app setup is unreadable. Save the app setup again.');
  }
}
/**
 * Atomically replaces only app setup; existing account grants and rotation caches remain intact.
 * @param {string} dataDirectory - Private station mount.
 * @param {unknown} input - Explicit owner submission.
 */
export function saveOAuthApp(dataDirectory: string, input: unknown): void {
  const app = validateOAuthApp(input);
  const { directory } = new DeviantartStore(dataDirectory);
  const temporary = path.join(directory, `oauth-app-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(app), { mode: DEVIANTART_MODE.file, flag: 'wx' });
    renameSync(temporary, path.join(directory, 'oauth-app.json'));
  } finally {
    rmSync(temporary, { force: true });
  }
}
