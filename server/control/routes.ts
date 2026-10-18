import { Router } from 'express';
import { HTTP_STATUS } from '../../shared/contracts.js';
import type { DownloadQueue } from '../downloads/queue.js';

/**
 * Exposes fixed owner-authenticated commands without accepting shell text.
 * @param {DownloadQueue} queue - Station queue.
 * @returns {Router} Protected control routes.
 */
export function createControlRoutes(queue: DownloadQueue): Router {
  const router = Router();
  router.get('/', (_request, response) => response.json(queue.controls.snapshot()));
  router.post('/', async (request, response) => {
    try {
      response.json(await queue.controls.command(request.body?.action, request.body?.target, request.body?.at));
    } catch (error) {
      response.status(HTTP_STATUS.conflict).json({ error: error instanceof Error ? error.message : 'Command failed.' });
    }
  });
  router.delete('/:taskId', (request, response) => {
    try {
      queue.controls.cancel(request.params.taskId);
      response.status(HTTP_STATUS.noContent).end();
    } catch (error) {
      response.status(HTTP_STATUS.conflict).json({ error: error instanceof Error ? error.message : 'Cancel failed.' });
    }
  });
  return router;
}
