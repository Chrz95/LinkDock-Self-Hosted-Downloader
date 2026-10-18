import { Router } from 'express';
import { HTTP_STATUS } from '../../shared/contracts.js';
import { JOB_OPTIONS } from '../../shared/jobOptions.js';
import type { DownloadQueue } from './queue.js';

/**
 * Applies only fixed workflow options to existing server-owned job IDs.
 * @param {DownloadQueue} queue - Owning queue.
 * @returns {Router} File selection and completion destination routes.
 */
export function createJobOptionsRoutes(queue: DownloadQueue): Router {
  const router = Router();
  for (const option of [JOB_OPTIONS.torrent, JOB_OPTIONS.destination, JOB_OPTIONS.retryMove]) {
    router.post(`/:jobId${option}`, (request, response) => {
      const job = queue.store.jobs.find((item) => item.id === request.params.jobId);
      if (!job) {
        response.status(HTTP_STATUS.notFound).end();
        return;
      }
      try {
        if (option === JOB_OPTIONS.torrent) {
          queue.selectTorrentFiles(job, request.body?.indexes);
        } else if (option === JOB_OPTIONS.destination) {
          queue.setDestination(job, request.body?.directory);
        } else {
          queue.retryMove(job);
        }
        response.status(HTTP_STATUS.noContent).end();
      } catch (error) {
        response.status(HTTP_STATUS.conflict).json({
          error: error instanceof Error ? error.message : 'Download option could not be saved.',
        });
      }
    });
  }
  return router;
}
