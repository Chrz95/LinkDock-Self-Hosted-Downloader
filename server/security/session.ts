import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, API_PATH } from '../../shared/contracts.js';
import { LIMIT, SESSION_COOKIE_NAME } from '../constants.js';
import type { ServerConfig } from '../config.js';

/**
 * Compares secrets with a fixed-length digest to avoid timing and length differences.
 * @param {string} submitted - Untrusted credential or signature.
 * @param {string} expected - Authoritative value.
 * @returns {boolean} Whether the values match.
 */
function secretsMatch(submitted: string, expected: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(submitted).digest(),
    createHash('sha256').update(expected).digest(),
  );
}

/**
 * Signs a session expiry; changing the access token revokes all existing sessions.
 * @param {string} expiry - Expiration timestamp in milliseconds.
 * @param {string} secret - Server-only access token.
 * @returns {string} Authenticated session signature.
 */
function signExpiry(expiry: string, secret: string): string {
  return createHmac('sha256', secret).update(expiry).digest('hex');
}

/**
 * Reads only our cookie, leaving malformed or expired values unauthenticated.
 * @param {Request} request - Incoming HTTP request.
 * @param {ServerConfig} configuration - Cookie signing configuration.
 * @returns {boolean} Whether this request carries a valid session.
 */
function hasValidSession(request: Request, configuration: ServerConfig): boolean {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);
  if (!cookie) {
    return false;
  }
  const [expiry, signature, extra] = cookie.split('.');
  return Boolean(
    expiry &&
    signature &&
    !extra &&
    Number(expiry) > Date.now() &&
    secretsMatch(signature, signExpiry(expiry, configuration.accessToken)),
  );
}

/**
 * Builds authentication handlers without exposing the access token to frontend bundles.
 * @param {ServerConfig} configuration - Runtime secret and cookie policy.
 * @returns {object} Route handlers for login, logout and protected requests.
 */
export function createSessionHandlers(configuration: ServerConfig) {
  return {
    /**
     * Requires an authenticated cookie for protected API requests.
     * @param {Request} request - Request being authorized.
     * @param {Response} response - Unauthorized response destination.
     * @param {NextFunction} next - Continues the middleware chain.
     */
    requireSession(request: Request, response: Response, next: NextFunction): void {
      if (!hasValidSession(request, configuration)) {
        response.status(HTTP_STATUS.unauthorized).json({ error: 'Unlock your station to continue.' });
        return;
      }
      next();
    },
    /**
     * Issues an HttpOnly cookie after checking the shared station password.
     * @param {Request} request - JSON body containing the submitted token.
     * @param {Response} response - Receives the signed session cookie.
     */
    login(request: Request, response: Response): void {
      const submitted: unknown = request.body?.token;
      if (typeof submitted !== 'string' || !secretsMatch(submitted, configuration.accessToken)) {
        response.status(HTTP_STATUS.unauthorized).json({ error: 'That station password is incorrect.' });
        return;
      }
      const expiry = String(Date.now() + LIMIT.sessionLifetimeMilliseconds);
      response
        .cookie(SESSION_COOKIE_NAME, `${expiry}.${signExpiry(expiry, configuration.accessToken)}`, {
          httpOnly: true,
          sameSite: 'strict',
          secure: configuration.secureCookie,
          path: API_PATH.prefix,
          maxAge: LIMIT.sessionLifetimeMilliseconds,
        })
        .status(HTTP_STATUS.noContent)
        .end();
    },
    /**
     * Clears the browser session without changing the station password.
     * @param {Request} _request - Authenticated logout request.
     * @param {Response} response - Cookie-clearing response.
     */
    logout(_request: Request, response: Response): void {
      response
        .clearCookie(SESSION_COOKIE_NAME, {
          path: API_PATH.prefix,
          httpOnly: true,
          sameSite: 'strict',
          secure: configuration.secureCookie,
        })
        .status(HTTP_STATUS.noContent)
        .end();
    },
  };
}
