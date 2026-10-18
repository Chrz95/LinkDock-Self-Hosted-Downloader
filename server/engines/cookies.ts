import { chmod, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { OUTPUT } from './constants.js';

/** Session cookie copies are readable and writable only by the service account. */
const PRIVATE_COOKIE_MODE = 0o600;

/**
 * Copies an owner-mounted cookie jar into private writable session storage outside all published output.
 * @param {string} dataDirectory - Persistent station root.
 * @param {string} [sourceFile] - Optional read-only Netscape cookie file.
 * @returns {Promise<{filename?: string; cleanup: () => Promise<void>}>} Disposable engine credential copy.
 */
export async function prepareMediaCookies(dataDirectory: string, sourceFile?: string) {
  if (!sourceFile) {
    return { filename: undefined, cleanup: async () => {} };
  }
  const privateDirectory = path.join(dataDirectory, OUTPUT.credentialsDirectory);
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(path.join(privateDirectory, OUTPUT.credentialSessionPrefix));
  const filename = path.join(directory, 'cookies.txt');
  try {
    await copyFile(sourceFile, filename);
    await chmod(filename, PRIVATE_COOKIE_MODE);
  } catch {
    await rm(directory, { recursive: true, force: true });
    throw new Error('The configured login cookie file is unreadable.');
  }
  /** Deletes the private session copy after the engine has stopped. @returns {Promise<void>} Completed cleanup. */
  async function cleanup(): Promise<void> {
    await rm(directory, { recursive: true, force: true });
  }
  return { filename, cleanup };
}
