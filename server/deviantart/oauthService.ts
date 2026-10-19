import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DEVIANTART } from '../../shared/deviantart.js';
import { DEVIANTART_OAUTH, type DeviantartOAuthResult } from '../../shared/deviantartOAuth.js';
import { DeviantartStore } from './store.js';
import { readOAuthApp, type DeviantartOAuthApp } from './oauthApp.js';
import { tryDeviantartLock } from './lock.js';
import { exchangeDeviantartCode } from './oauthToken.js';
interface PendingAuthorization {
  browser: Buffer;
  verifier: string;
  callbackUrl: string;
  app: DeviantartOAuthApp;
  revision: string | null;
  expires: number;
  timer: ReturnType<typeof setTimeout>;
  returnMode: 'direct' | 'copy';
}
/** Short-lived, browser-bound PKCE grants; neither tokens nor provider errors are returned to the browser. */
export class DeviantartOAuthService {
  private readonly pending = new Map<string, PendingAuthorization>();
  /**
   * Keeps authorization state scoped to a single running station.
   * @param {string} dataDirectory - Private station storage.
   */
  constructor(private readonly dataDirectory: string) {}
  /** Invalidates unfinished authorizations when the owner changes account or application setup. */
  invalidate(): void {
    for (const key of this.pending.keys()) {
      this.remove(key);
    }
  }
  /**
   * Creates a fresh one-use state, browser binding and PKCE challenge after owner authentication.
   * @param {string} callbackUrl - Validated station callback URL, pinned for this transaction.
   * @param {string} [previousBrowser] - Binding from a canceled sign-in in the same browser.
   * @param {'direct' | 'copy'} [returnMode] - Direct HTTPS callback or owner-submitted HTTP-friendly response.
   * @returns {{url: string; browser: string}} Provider authorization URL and HttpOnly cookie value.
   */
  begin(callbackUrl: string, previousBrowser = '', returnMode: 'direct' | 'copy' = 'direct') {
    if (
      new URL(callbackUrl).protocol !== 'https:' ||
      (returnMode === 'copy' && callbackUrl !== DEVIANTART_OAUTH.landing)
    ) {
      throw new Error('DeviantArt requires the supported HTTPS authorization redirect.');
    }
    const previous = createHash('sha256').update(previousBrowser).digest();
    for (const [key, pending] of this.pending) {
      if (pending.expires <= Date.now()) {
        this.remove(key);
      }
    }
    const app = readOAuthApp(this.dataDirectory);
    if (!app) {
      throw new Error('Save a confidential DeviantArt app ID and secret before connecting.');
    }
    const release = tryDeviantartLock(this.dataDirectory);
    if (!release) {
      throw new Error('Pause DeviantArt downloads before connecting the account.');
    }
    let revision;
    try {
      revision = new DeviantartStore(this.dataDirectory).read().account?.id ?? null;
    } finally {
      release();
    }
    for (const [key, pending] of this.pending) {
      if (timingSafeEqual(pending.browser, previous)) {
        this.remove(key);
      }
    }
    if (this.pending.size >= DEVIANTART_OAUTH.maximumPending) {
      throw new Error('Too many pending sign-ins. Wait a few minutes and try again.');
    }
    const state = randomBytes(DEVIANTART_OAUTH.randomBytes).toString('base64url');
    const browser = randomBytes(DEVIANTART_OAUTH.randomBytes).toString('base64url');
    const verifier = randomBytes(DEVIANTART_OAUTH.verifierBytes).toString('base64url');
    const timer = setTimeout(() => this.remove(state), DEVIANTART_OAUTH.lifetimeMilliseconds);
    timer.unref();
    this.pending.set(state, {
      browser: createHash('sha256').update(browser).digest(),
      verifier,
      callbackUrl,
      app,
      revision,
      expires: Date.now() + DEVIANTART_OAUTH.lifetimeMilliseconds,
      timer,
      returnMode,
    });
    const url = new URL('https://www.deviantart.com/oauth2/authorize');
    url.search = new URLSearchParams({
      client_id: app.clientId,
      response_type: 'code',
      redirect_uri: callbackUrl,
      scope: 'browse',
      view: 'login',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.href, browser };
  }
  /**
   * Consumes a browser-bound callback once, preserving the previous account on every failed exchange.
   * @param {unknown} state - Returned authorization state.
   * @param {string} browser - HttpOnly SameSite=Lax browser binding.
   * @param {unknown} code - One-use authorization code.
   * @param {unknown} error - Provider denial flag; its text is never retained or rendered.
   * @param {'direct' | 'copy'} [returnMode] - Completion transport, pinned at authorization start.
   * @returns {Promise<DeviantartOAuthResult>} Fixed, non-secret outcome only.
   */
  async complete(
    state: unknown,
    browser: string,
    code: unknown,
    error: unknown,
    returnMode: 'direct' | 'copy' = 'direct',
  ): Promise<DeviantartOAuthResult> {
    const pending = typeof state === 'string' ? this.pending.get(state) : undefined;
    if (
      !pending ||
      !browser ||
      pending.returnMode !== returnMode ||
      pending.expires <= Date.now() ||
      !timingSafeEqual(pending.browser, createHash('sha256').update(browser).digest())
    ) {
      return 'expired';
    }
    this.remove(state as string);
    if (error) {
      return 'denied';
    }
    if (typeof code !== 'string' || !code || code.length > DEVIANTART.maximumTokenCharacters) {
      return 'failed';
    }
    const release = tryDeviantartLock(this.dataDirectory);
    if (!release) {
      return 'busy';
    }
    try {
      const store = new DeviantartStore(this.dataDirectory);
      const app = readOAuthApp(this.dataDirectory);
      if (
        (store.read().account?.id ?? null) !== pending.revision ||
        app?.clientId !== pending.app.clientId ||
        app.clientSecret !== pending.app.clientSecret
      ) {
        return 'expired';
      }
      const account = await exchangeDeviantartCode(pending.app, code, pending.verifier, pending.callbackUrl);
      // Reload preferences after network I/O so collection changes made during sign-in are preserved.
      store.replaceAccount(store.read(), account);
      return 'connected';
    } catch {
      return 'failed';
    } finally {
      release();
    }
  }
  /**
   * Releases the transaction and its expiration timer without retaining codes or grant material.
   * @param {string} state - Application-generated state key.
   */
  private remove(state: string): void {
    clearTimeout(this.pending.get(state)?.timer);
    this.pending.delete(state);
  }
}
