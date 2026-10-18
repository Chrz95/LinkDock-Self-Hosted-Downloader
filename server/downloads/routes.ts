import { Router, type Request, type Response } from 'express';
import { DOWNLOAD_PATH, HTTP_METHOD, HTTP_STATUS, JOB_ACTION } from '../../shared/contracts.js';
import type { DownloadQueue } from './queue.js';
import { createFileRoutes } from './fileRoutes.js';
import { JOB_PRIORITY } from '../../shared/batch.js';
import { createPreviewRoutes } from './delivery/previewRoutes.js';
import { createArchiveRoutes } from './delivery/archiveRoutes.js';
import { createBulkLibraryRoutes } from './bulkLibrary.js';
import { createJobOptionsRoutes } from './jobOptionsRoutes.js';

/**
 * Wires authenticated queue operations; invalid IDs never become filesystem paths.
 * @param {DownloadQueue} queue - Shared process-local queue.
 * @returns {Router} Routes mounted beneath the downloads endpoint.
 */
export function createDownloadRoutes(queue: DownloadQueue): Router {
  const router = Router();
  router.use(createBulkLibraryRoutes(queue));
  router.use(createJobOptionsRoutes(queue));
  router.get('/', (_request, response) => response.json(queue.snapshot()));
  router.post(DOWNLOAD_PATH.batchPreview, (request, response) => {
    try {
      response.json(queue.previewBatch(request.body?.urls, request.body?.sourceType, request.body?.quality));
    } catch (error) {
      response
        .status(HTTP_STATUS.badRequest)
        .json({ error: error instanceof Error ? error.message : 'Invalid batch.' });
    }
  });
  router.post(DOWNLOAD_PATH.batch, (request, response) => {
    try {
      response
        .status(HTTP_STATUS.created)
        .json(queue.addBatch(request.body?.urls, request.body?.sourceType, request.body?.quality));
    } catch (error) {
      response
        .status(HTTP_STATUS.badRequest)
        .json({ error: error instanceof Error ? error.message : 'Invalid batch.' });
    }
  });
  router.post(
    '/' /**
     * Queues a submitted source and returns input failures as useful client feedback.
     * @param {Request} request - Incoming request.
     * @param {Response} response - HTTP response destination.
     */,
    (request, response) => {
      try {
        response
          .status(HTTP_STATUS.created)
          .json(queue.add(request.body?.url, request.body?.sourceType, request.body?.quality));
      } catch (error) {
        response
          .status(HTTP_STATUS.badRequest)
          .json({ error: error instanceof Error ? error.message : 'Invalid link.' });
      }
    },
  );
  router.post(DOWNLOAD_PATH.torrentUpload, (request, response) => {
    try {
      response.status(HTTP_STATUS.created).json(queue.addTorrent(request.body?.torrentBase64, request.body?.filename));
    } catch (error) {
      response
        .status(HTTP_STATUS.badRequest)
        .json({ error: error instanceof Error ? error.message : 'Invalid torrent.' });
    }
  });
  router.param(
    'jobId' /**
     * Rejects unknown transfer IDs before reaching a file or mutation route.
     * @param {Request} _request - Unused incoming request.
     * @param {Response} response - HTTP response destination.
     * @param {NextFunction} next - Continues middleware or propagates an error.
     * @param {string} jobId - Validated transfer identifier.
     */,
    (_request, response, next, jobId: string) => {
      const job = queue.store.jobs.find((entry) => entry.id === jobId);
      if (!job) {
        response.status(HTTP_STATUS.notFound).json({ error: 'Download not found.' });
        return;
      }
      next();
    },
  );
  router.use(createFileRoutes(queue));
  router.use(createPreviewRoutes(queue));
  router.use(createArchiveRoutes(queue));
  router.post(`/:jobId${DOWNLOAD_PATH.organization}`, (request, response) => {
    const job = queue.store.jobs.find((entry) => entry.id === request.params.jobId);
    if (!job) {
      response.status(HTTP_STATUS.notFound).end();
      return;
    }
    try {
      queue.organize(job, request.body);
      response.status(HTTP_STATUS.noContent).end();
    } catch (error) {
      response.status(HTTP_STATUS.badRequest).json({
        error: error instanceof Error ? error.message : 'Organization could not be saved.',
      });
    }
  });
  router.post('/:jobId/:action', (request, response) => mutateJob(request, response, queue));
  router.delete('/:jobId', (request, response) => mutateJob(request, response, queue));
  return router;
}

/**
 * Serializes terminal-state mutations and returns actionable conflict errors.
 * @param {Request} request - Target ID and optional action.
 * @param {Response} response - Mutation result destination.
 * @param {DownloadQueue} queue - Owning queue instance.
 */
async function mutateJob(request: Request, response: Response, queue: DownloadQueue): Promise<void> {
  const job = queue.store.jobs.find((entry) => entry.id === request.params.jobId);
  if (!job) {
    response.status(HTTP_STATUS.notFound).end();
    return;
  }
  try {
    if (request.method === HTTP_METHOD.delete) {
      queue.remove(job);
    } else if (request.params.action === JOB_ACTION.cancel) {
      queue.cancel(job);
    } else if (request.params.action === JOB_ACTION.retry) {
      queue.retry(job);
    } else if (request.params.action === JOB_ACTION.pause) {
      await queue.pause(job);
    } else if (request.params.action === JOB_ACTION.resume) {
      queue.resume(job);
    } else if (request.params.action === JOB_ACTION.priorityHigh) {
      queue.setPriority(job, JOB_PRIORITY.high);
    } else if (request.params.action === JOB_ACTION.priorityNormal) {
      queue.setPriority(job, JOB_PRIORITY.normal);
    } else if (request.params.action === JOB_ACTION.priorityLow) {
      queue.setPriority(job, JOB_PRIORITY.low);
    } else {
      response.status(HTTP_STATUS.notFound).end();
      return;
    }
    response.status(HTTP_STATUS.noContent).end();
  } catch (error) {
    response.status(HTTP_STATUS.conflict).json({ error: error instanceof Error ? error.message : 'Action failed.' });
  }
}
