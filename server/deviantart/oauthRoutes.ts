import { Router, type Request, type RequestHandler } from 'express';
import { HTTP_STATUS } from '../../shared/contracts.js';
import { DEVIANTART_OAUTH } from '../../shared/deviantartOAuth.js';
import type { ServerConfig } from '../config.js';
import { readOAuthApp, saveOAuthApp } from './oauthApp.js';
import { DeviantartOAuthService } from './oauthService.js';
import { tryDeviantartLock } from './lock.js';
import { DeviantartHomepageError, deviantartReturnMode, parseDeviantartReturn } from './oauthReturn.js';
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
    if (result !== 'expired') {
      response.clearCookie(DEVIANTART_OAUTH.cookie, cookie);
    }
    response.redirect(DEVIANTART_OAUTH.redirectStatus, `/?${DEVIANTART_OAUTH.resultParameter}=${result}#settings`);
  });
  router.use(requireSession);
  router.get('/', (request, response) => {
    try {
      response.json({
        configured: Boolean(readOAuthApp(configuration.dataDirectory)),
        ...deviantartReturnMode(configuration, request),
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
      response.json({ configured: true, ...deviantartReturnMode(configuration, request) });
    } catch {
      response.status(HTTP_STATUS.badRequest).json({ error: 'Enter a valid confidential app client ID and secret.' });
    } finally {
      release();
    }
  });
  router.post('/start', (request, response) => {
    try {
      const mode = deviantartReturnMode(configuration, request);
      const pending = service.begin(mode.callbackUrl, browserBinding(request), mode.returnMode);
      response.cookie(DEVIANTART_OAUTH.cookie, pending.browser, {
        ...cookie,
        maxAge: DEVIANTART_OAUTH.lifetimeMilliseconds,
      });
      response.json({ authorizationUrl: pending.url, returnMode: mode.returnMode });
    } catch (error) {
      response.status(HTTP_STATUS.conflict).json({
        error:
          error instanceof Error && /^(?:Pause|Save a|Too many)/u.test(error.message)
            ? error.message
            : 'DeviantArt sign-in could not start. Check app setup and private storage.',
      });
    }
  });
  router.post('/complete', async (request, response) => {
    let input;
    try {
      input = parseDeviantartReturn(request.body?.responseUrl);
    } catch (error) {
      response.status(HTTP_STATUS.badRequest).json({
        error:
          error instanceof DeviantartHomepageError
            ? DEVIANTART_OAUTH.homepageMessage
            : 'Paste the complete authorization response URL.',
      });
      return;
    }
    const result = await service.complete(input.state, browserBinding(request), input.code, input.error, 'copy');
    if (result !== 'expired') {
      response.clearCookie(DEVIANTART_OAUTH.cookie, cookie);
    }
    response.json({ result });
  });
  return router;
}
