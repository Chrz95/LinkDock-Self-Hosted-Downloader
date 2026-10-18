import { Router } from 'express';
import { UTILITY_ACTION } from '../../shared/utilities.js';
import { HTTP_STATUS } from '../../shared/contracts.js';
import type { UtilityService } from './service.js';
/**
 * Accepts fixed authenticated utility actions; no executable names, repository URLs or shell arguments are accepted.
 * @param {UtilityService} service - Queue-owned updater.
 * @returns {Router} Private status/preferences/control routes.
 */
export function createUtilityRoutes(service: UtilityService): Router {
  const router = Router();
  router.get('/', (_request, response) => response.json(service.snapshot()));
  router.post('/', async (request, response) => {
    try {
      if (request.body?.action === UTILITY_ACTION.update) {
        service.request();
      } else if (request.body?.action === UTILITY_ACTION.cancel) {
        service.cancel();
      } else if (request.body?.action === UTILITY_ACTION.restore) {
        await service.restoreBundled();
      } else if (request.body?.action === UTILITY_ACTION.rollback) {
        await service.restorePrevious();
      } else if (request.body?.action === UTILITY_ACTION.settings) {
        service.setEnabled(request.body.enabled);
      } else {
        throw new Error('Choose a supported utility action.');
      }
      response.json(service.snapshot());
    } catch {
      response.status(HTTP_STATUS.conflict).json({
        error: 'Could not change utility settings. Check storage, input and active downloads or updates.',
      });
    }
  });
  return router;
}
