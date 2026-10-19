import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BROWSER_ACCESS, type BrowserAccessSnapshot } from '../../shared/browserAccess.js';
import { safeDirectory } from '../downloads/completion/paths.js';
import { savePrivateJson } from '../notifications/store.js';
import { parseCookieJar } from './cookieJar.js';

export interface BrowserAccessState {
  cookies: string | null;
  userAgent: string;
  delaySeconds: number;
  updatedAt: string | null;
}
/** Private reusable session and pacing preferences, independent of public download payloads. */
export class BrowserAccessStore {
  readonly filename: string;
  /**
   * Resolves private application-owned storage, refusing symbolic-link ancestors.
   * @param {string} dataDirectory - Writable state mount.
   */
  constructor(dataDirectory: string) {
    this.filename = path.join(safeDirectory(path.join(dataDirectory, 'credentials'), true), 'browser-access.json');
  }
  /** Loads validated state; corruption never silently erases credentials.
   * @returns {BrowserAccessState} Current private session and pacing preferences.
   */
  read(): BrowserAccessState {
    if (!existsSync(this.filename)) {
      return { cookies: null, userAgent: '', delaySeconds: 0, updatedAt: null };
    }
    const information = lstatSync(this.filename);
    const maximumStateBytes = 1_572_864;
    if (!information.isFile() || information.isSymbolicLink() || information.size > maximumStateBytes) {
      throw new Error('Browser session storage is invalid. Check the private credentials directory.');
    }
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(this.filename, 'utf8'));
    } catch {
      throw new Error('Saved browser session is unreadable. Remove the imported session in Settings.');
    }
    if (!value || typeof value !== 'object') {
      throw new Error('Saved browser session is invalid.');
    }
    const state = value as BrowserAccessState;
    if (state.cookies !== null) {
      parseCookieJar(state.cookies);
    }
    if (
      typeof state.userAgent !== 'string' ||
      state.userAgent.length > BROWSER_ACCESS.maximumUserAgent ||
      /[^\x20-\x7e]/u.test(state.userAgent) ||
      !Number.isSafeInteger(state.delaySeconds) ||
      state.delaySeconds < 0 ||
      state.delaySeconds > BROWSER_ACCESS.maximumDelaySeconds ||
      (state.updatedAt !== null &&
        (typeof state.updatedAt !== 'string' || !Number.isFinite(Date.parse(state.updatedAt))))
    ) {
      throw new Error('Saved browser session is invalid.');
    }
    return {
      cookies: state.cookies,
      userAgent: state.userAgent,
      delaySeconds: state.delaySeconds,
      updatedAt: state.updatedAt,
    };
  }
  /** Returns counts and settings only; cookie values and browser identifiers never leave the server.
   * @returns {BrowserAccessSnapshot} Private API's non-secret setup metadata.
   */
  snapshot(): BrowserAccessSnapshot {
    const state = this.read();
    const cookies = state.cookies ? parseCookieJar(state.cookies).cookies : [];
    return {
      hasCookies: Boolean(state.cookies),
      cookieCount: cookies.length,
      domainCount: new Set(cookies.map((cookie) => cookie.domain)).size,
      hasUserAgent: Boolean(state.userAgent),
      delaySeconds: state.delaySeconds,
      updatedAt: state.updatedAt,
    };
  }
  /**
   * Atomically saves validated state; secrets never enter queue history or downloadable directories.
   * @param {BrowserAccessState} state - Updated private session.
   */
  save(state: BrowserAccessState): void {
    savePrivateJson(this.filename, state);
  }
}
