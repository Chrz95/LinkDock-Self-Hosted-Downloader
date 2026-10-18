import { Router } from 'express';
import { HTTP_STATUS } from '../../shared/contracts.js';
import type { DownloadQueue } from '../downloads/queue.js';

/**
 * Exposes preferences behind the same session and CSRF policy as queue mutations.
 * @param {DownloadQueue} queue - Owning queue and preferences.
 * @returns {Router} Complete-object read/write routes.
 */
export function createPolicyRoutes(queue: DownloadQueue): Router {
  const router = Router();
  router.get('/', (_request, response) => response.json(queue.policy.settings));
  router.post('/', (request, response) => {
    try {
      queue.updateSettings(request.body);
      response.json(queue.policy.settings);
    } catch (error) {
      response.status(HTTP_STATUS.badRequest).json({
        error: error instanceof Error ? error.message : 'Station preferences could not be saved.',
      });
    }
  });
  return router;
}
