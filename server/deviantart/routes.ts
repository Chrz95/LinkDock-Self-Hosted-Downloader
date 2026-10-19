import { Router } from 'express';
import { DEVIANTART_ACTION, defaultDeviantartPreferences } from '../../shared/deviantart.js';
import { HTTP_STATUS } from '../../shared/contracts.js';
import { DeviantartStore } from './store.js';
import { validateDeviantartCredentials, validateDeviantartPreferences } from './validation.js';
import { tryDeviantartLock } from './lock.js';
/**
 * Exposes private metadata and bounded owner actions behind the existing session and CSRF middleware.
 * @param {string} dataDirectory - Private station state.
 * @param {() => void} [onAccountChange] - Invalidates pending sign-ins after an explicit account mutation.
 * @returns {Router} Preferences and write-only account setup.
 */
export function createDeviantartRoutes(dataDirectory: string, onAccountChange?: () => void): Router {
  const router = Router();
  router.get('/', (_request, response) => {
    try {
      response.json(new DeviantartStore(dataDirectory).snapshot());
    } catch {
      response.status(HTTP_STATUS.conflict).json({ error: 'DeviantArt settings are unavailable.' });
    }
  });
  router.post('/', (request, response) => {
    const { action } = request.body ?? {};
    const changesAccount = action === DEVIANTART_ACTION.account || action === DEVIANTART_ACTION.clear;
    const release = changesAccount ? tryDeviantartLock(dataDirectory) : null;
    if (changesAccount && !release) {
      response.status(HTTP_STATUS.conflict).json({
        error: 'Pause DeviantArt downloads before replacing or removing the account.',
      });
      return;
    }
    try {
      const store = new DeviantartStore(dataDirectory);
      let state;
      try {
        state = store.read();
      } catch (error) {
        if (action !== DEVIANTART_ACTION.clear) {
          throw error;
        }
        state = { ...defaultDeviantartPreferences(), account: null, updatedAt: null };
      }
      if (action === DEVIANTART_ACTION.preferences) {
        store.save({ ...state, ...validateDeviantartPreferences(request.body) });
      } else if (action === DEVIANTART_ACTION.account) {
        store.replaceAccount(state, validateDeviantartCredentials(request.body));
      } else if (action === DEVIANTART_ACTION.clear) {
        store.replaceAccount(state, null);
      } else {
        throw new Error('Choose a supported DeviantArt action.');
      }
      if (changesAccount) {
        onAccountChange?.();
      }
      response.json(store.snapshot());
    } catch {
      response.status(HTTP_STATUS.badRequest).json({
        error: 'DeviantArt settings could not be saved. Check the fields and private storage.',
      });
    } finally {
      release?.();
    }
  });
  return router;
}
