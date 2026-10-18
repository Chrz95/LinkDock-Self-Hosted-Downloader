import { Router, type Request, type Response, type NextFunction } from 'express';
import { pipeline } from 'node:stream/promises';
import { DOWNLOAD_PATH, DOWNLOAD_STATUS, HTTP_METHOD, HTTP_STATUS } from '../../../shared/contracts.js';
import { DELIVERY_LIMIT } from '../../../shared/media.js';
import type { DownloadQueue } from '../queue.js';
import { FileDeliveryError } from './publishedFile.js';
import { archiveDownloadName } from './archiveNames.js';
import { prepareArchive, createArchiveStream, type ArchiveOutput } from './archive.js';

/**
 * Exports only the completed manifest under a bounded deletion-protecting lease.
 * @param {DownloadQueue} queue - Shared owner queue.
 * @returns {Router} Authenticated ZIP delivery routes.
 */
export function createArchiveRoutes(queue: DownloadQueue): Router {
  const router = Router();
  /**
   * Validates before sending bytes and releases the slot on every terminal response path.
   * @param {Request} request - Existing completed job ID.
   * @param {Response} response - Browser-managed attachment.
   * @param {NextFunction} next - Safe central error handling.
   * @returns {Promise<void>} Delivery ended or was interrupted.
   */
  async function archive(request: Request, response: Response, next: NextFunction): Promise<void> {
    const job = queue.store.jobs.find((entry) => entry.id === request.params.jobId);
    if (!job) {
      response.status(HTTP_STATUS.notFound).end();
      return;
    }
    if (job.status !== DOWNLOAD_STATUS.completed) {
      response.status(HTTP_STATUS.conflict).json({ error: 'This download is not ready.' });
      return;
    }
    if (request.headers.range) {
      response
        .status(HTTP_STATUS.rangeNotSatisfiable)
        .json({ error: 'ZIP downloads cannot resume. Start a fresh save.' });
      return;
    }
    const release = queue.archiveAccess.acquire(job.id);
    if (!release) {
      response.setHeader('Retry-After', String(DELIVERY_LIMIT.retrySeconds));
      response
        .status(HTTP_STATUS.tooManyRequests)
        .json({ error: 'Two ZIP downloads are already running. Try again soon.' });
      return;
    }
    const controller = new AbortController();
    let output: ArchiveOutput | undefined;
    /** Cancels active reading when the browser closes its download connection. */
    function closed(): void {
      if (!response.writableFinished) {
        controller.abort();
      }
    }
    response.on('close', closed);
    response.setTimeout(DELIVERY_LIMIT.idleMilliseconds, () => {
      controller.abort();
      response.destroy();
    });
    try {
      const entries = await prepareArchive(queue, job, controller.signal);
      controller.signal.throwIfAborted();
      response.attachment(archiveDownloadName(job.filename));
      response.set({ 'Content-Type': 'application/zip', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none' });
      if (request.method === HTTP_METHOD.head) {
        response.end();
        return;
      }
      output = createArchiveStream(queue, job, entries, controller.signal);
      await pipeline(output.stream, response);
    } catch (error) {
      if (response.headersSent || response.destroyed) {
        response.destroy();
      } else if (error instanceof FileDeliveryError) {
        response.status(error.status).json({ error: error.message });
      } else {
        next(error);
      }
    } finally {
      controller.abort();
      response.removeListener('close', closed);
      await output?.waitForFiles();
      release();
    }
  }
  router.get(`/:jobId${DOWNLOAD_PATH.archive}`, archive);
  return router;
}
