import { Router } from 'express';
import { BROWSER_ACCESS, BROWSER_ACTION } from '../../shared/browserAccess.js';
import { HTTP_STATUS } from '../../shared/contracts.js';
import { BrowserAccessStore, type BrowserAccessState } from './store.js';
import { parseCookieJar } from './cookieJar.js';

/**
 * Accepts only owner-imported session exports and bounded pacing settings behind existing session/CSRF checks.
 * @param {string} dataDirectory - Private application state root.
 * @returns {Router} Metadata, import, remove and pacing routes; never a cookie-export endpoint.
 */
export function createBrowserAccessRoutes(dataDirectory: string): Router {
  const router = Router();
  router.get('/', (_request, response) => {
    try {
      response.json(new BrowserAccessStore(dataDirectory).snapshot());
    } catch {
      response.status(HTTP_STATUS.conflict).json({ error: 'Browser session storage is unavailable.' });
    }
  });
  router.post('/', (request, response) => {
    try {
      const store = new BrowserAccessStore(dataDirectory);
      let state: BrowserAccessState;
      try {
        state = store.read();
      } catch (error) {
        if (request.body?.action !== BROWSER_ACTION.clear) {
          throw error;
        }
        state = { cookies: null, userAgent: '', delaySeconds: 0, updatedAt: null };
      }
      if (request.body?.action === BROWSER_ACTION.import) {
        const userAgent: unknown = request.body.userAgent ?? '';
        if (
          typeof userAgent !== 'string' ||
          userAgent.length > BROWSER_ACCESS.maximumUserAgent ||
          /[^\x20-\x7e]/u.test(userAgent)
        ) {
          throw new Error('The optional browser User-Agent must be a single printable line up to 512 characters.');
        }
        state.cookies = parseCookieJar(request.body.cookies).text;
        state.userAgent = userAgent.trim();
      } else if (request.body?.action === BROWSER_ACTION.clear) {
        state.cookies = null;
        state.userAgent = '';
      } else if (request.body?.action === BROWSER_ACTION.settings) {
        const value: unknown = request.body.delaySeconds;
        if (
          typeof value !== 'number' ||
          !Number.isSafeInteger(value) ||
          value < 0 ||
          value > BROWSER_ACCESS.maximumDelaySeconds
        ) {
          throw new Error('Request delay must be a whole number from 0 to 60 seconds.');
        }
        state.delaySeconds = value;
      } else {
        throw new Error('Choose a supported browser-session action.');
      }
      state.updatedAt = new Date().toISOString();
      store.save(state);
      response.json(store.snapshot());
    } catch (error) {
      response.status(HTTP_STATUS.badRequest).json({
        error:
          error instanceof Error &&
          /^(?:Choose|Use |The cookie|The export|The optional|Request delay)/u.test(error.message)
            ? error.message
            : 'Browser session could not be saved. Check input and private storage.',
      });
    }
  });
  return router;
}
