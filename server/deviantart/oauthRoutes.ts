import { Router, type Request, type RequestHandler } from 'express';
import { HTTP_STATUS } from '../../shared/contracts.js';
import { DEVIANTART_OAUTH } from '../../shared/deviantartOAuth.js';
import type { ServerConfig } from '../config.js';
import { readOAuthApp, saveOAuthApp } from './oauthApp.js';
import { DeviantartOAuthService } from './oauthService.js';
import { tryDeviantartLock } from './lock.js';
/**
 * Extracts only the dedicated, bounded OAuth binding cookie, independent of the strict station cookie.
 * @param {Request} request - Browser request.
 * @returns {string} Browser binding, or an empty string when absent.
 */
function browserBinding(request: Request): string {
  const prefix = `${DEVIANTART_OAUTH.cookie}=`;
  return (
    request.headers.cookie
      ?.split(';')
      .find((part) => part.trim().startsWith(prefix))
      ?.trim()
      .slice(prefix.length) ?? ''
  );
}
/**
 * Adds an owner-only PKCE sign-in flow and a one-use browser-bound provider callback.
 * @param {ServerConfig} configuration - Station identity, canonical origin and cookie policy.
 * @param {RequestHandler} requireSession - Existing owner session middleware.
 * @param {DeviantartOAuthService} service - Shared transaction owner, invalidated by explicit account changes.
 * @returns {Router} Dedicated OAuth routes; only the protected transaction callback is public.
 */
export function createDeviantartOAuthRoutes(
  configuration: ServerConfig,
  requireSession: RequestHandler,
  service: DeviantartOAuthService,
): Router {
  const router = Router();
  const cookie = {
    httpOnly: true,
    secure: configuration.secureCookie,
    sameSite: 'lax' as const,
    path: DEVIANTART_OAUTH.path,
  };
  router.get('/callback', async (request, response) => {
    const result = await service.complete(
      request.query.state,
      browserBinding(request),
      request.query.code,
      request.query.error,
    );
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.clearCookie(DEVIANTART_OAUTH.cookie, cookie);
    response.redirect(DEVIANTART_OAUTH.redirectStatus, `/?${DEVIANTART_OAUTH.resultParameter}=${result}#settings`);
  });
  router.use(requireSession);
  router.get('/', (request, response) => {
    const origin = configuration.publicOrigin ?? `${request.protocol}://${request.get('host')}`;
    try {
      response.json({
        configured: Boolean(readOAuthApp(configuration.dataDirectory)),
        callbackUrl: new URL(DEVIANTART_OAUTH.callback, origin).href,
      });
    } catch {
      response.status(HTTP_STATUS.conflict).json({ error: 'DeviantArt app setup is unreadable. Save it again.' });
    }
  });
  router.post('/setup', (request, response) => {
    const release = tryDeviantartLock(configuration.dataDirectory);
    if (!release) {
      response.status(HTTP_STATUS.conflict).json({ error: 'Pause DeviantArt downloads before changing app setup.' });
      return;
    }
    try {
      saveOAuthApp(configuration.dataDirectory, request.body);
      service.invalidate();
      const origin = configuration.publicOrigin ?? `${request.protocol}://${request.get('host')}`;
      response.json({ configured: true, callbackUrl: new URL(DEVIANTART_OAUTH.callback, origin).href });
    } catch {
      response.status(HTTP_STATUS.badRequest).json({ error: 'Enter a valid confidential app client ID and secret.' });
    } finally {
      release();
    }
  });
  router.post('/start', (request, response) => {
    const origin = configuration.publicOrigin ?? `${request.protocol}://${request.get('host')}`;
    try {
      const pending = service.begin(new URL(DEVIANTART_OAUTH.callback, origin).href, browserBinding(request));
      response.cookie(DEVIANTART_OAUTH.cookie, pending.browser, {
        ...cookie,
        maxAge: DEVIANTART_OAUTH.lifetimeMilliseconds,
      });
      response.json({ authorizationUrl: pending.url });
    } catch (error) {
      response.status(HTTP_STATUS.conflict).json({
        error:
          error instanceof Error && /^(?:Pause|Save a|Too many)/u.test(error.message)
            ? error.message
            : 'DeviantArt sign-in could not start. Check app setup and private storage.',
      });
    }
  });
  return router;
}
