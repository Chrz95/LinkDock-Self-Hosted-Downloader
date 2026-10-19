import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  rmSync,
  readdirSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import path from 'node:path';
import { DEVIANTART, defaultDeviantartPreferences } from '../../shared/deviantart.js';
import type { DeviantartPreferences, DeviantartSnapshot } from '../../shared/deviantart.js';
import { safeDirectory } from '../downloads/completion/paths.js';
import { ACCOUNT_ID, DEVIANTART_MODE } from './constants.js';
import { validateDeviantartCredentials, validateDeviantartPreferences } from './validation.js';
import type { DeviantartCredentials } from './validation.js';
export interface DeviantartState extends DeviantartPreferences {
  account: (DeviantartCredentials & { id: string }) | null;
  updatedAt: string | null;
}
/** Private account state and generation-specific caches remain outside every download root. */
export class DeviantartStore {
  readonly directory: string;
  readonly filename: string;
  /**
   * Resolves private storage and rejects symbolic-link ancestors.
   * @param {string} dataDirectory - Station state mount.
   */
  constructor(dataDirectory: string) {
    this.directory = safeDirectory(path.join(dataDirectory, 'credentials', 'deviantart'), true);
    chmodSync(this.directory, DEVIANTART_MODE.directory);
    this.filename = path.join(this.directory, 'settings.json');
  }
  /** Loads defaults or validated account state without exposing parse errors containing tokens.
   * @returns {DeviantartState} Current private state.
   */
  read(): DeviantartState {
    if (!existsSync(this.filename)) {
      return { ...defaultDeviantartPreferences(), account: null, updatedAt: null };
    }
    try {
      const info = lstatSync(this.filename);
      if (!info.isFile() || info.isSymbolicLink() || info.size > DEVIANTART.maximumStateBytes) {
        throw new Error();
      }
      const value = JSON.parse(readFileSync(this.filename, 'utf8')) as DeviantartState;
      const preferences = validateDeviantartPreferences(value);
      const account = value.account === null ? null : validateDeviantartCredentials(value.account);
      if (account && !ACCOUNT_ID.test(value.account!.id)) {
        throw new Error();
      }
      if (
        value.updatedAt !== null &&
        (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))
      ) {
        throw new Error();
      }
      chmodSync(this.filename, DEVIANTART_MODE.file);
      return {
        ...preferences,
        account: account ? { ...account, id: value.account!.id } : null,
        updatedAt: value.updatedAt,
      };
    } catch {
      throw new Error('DeviantArt storage is unreadable. Remove the account in Settings to reset it.');
    }
  }
  /** Returns preferences and setup flags only; no account identifiers or token values.
   * @returns {DeviantartSnapshot} Non-secret setup metadata.
   */
  snapshot(): DeviantartSnapshot {
    const state = this.read();
    return {
      include: state.include,
      original: state.original,
      stories: state.stories,
      hasAccount: Boolean(state.account),
      customClient: Boolean(state.account?.clientId),
      updatedAt: state.updatedAt,
    };
  }
  /**
   * Atomically persists whitelisted state with private permissions.
   * @param {DeviantartState} state - New account and source settings.
   */
  save(state: DeviantartState): void {
    const temporary = path.join(this.directory, `settings-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }), {
        mode: DEVIANTART_MODE.file,
        flag: 'wx',
      });
      renameSync(temporary, this.filename);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  /**
   * Replaces credentials with a fresh cache generation; caller must hold the account lock.
   * @param {DeviantartState} state - Current saved preferences.
   * @param {DeviantartCredentials | null} credentials - Explicit import or removal.
   */
  replaceAccount(state: DeviantartState, credentials: DeviantartCredentials | null): void {
    this.save({ ...state, account: credentials ? { ...credentials, id: randomUUID() } : null });
    const current = this.read().account?.id;
    for (const entry of readdirSync(this.directory)) {
      if (ACCOUNT_ID.test(entry) && entry !== current) {
        rmSync(path.join(this.directory, entry), { recursive: true, force: true });
      }
    }
  }
}
