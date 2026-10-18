import { Router, type Request, type Response, type NextFunction } from 'express';
import { DOWNLOAD_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../../shared/contracts.js';
import { resolveArtifactPath } from '../engines/artifacts.js';
import type { DownloadQueue } from './queue.js';

/**
 * Serves legacy direct files and individual files from multi-artifact jobs using server-owned paths.
 * @param {DownloadQueue} queue - Owning transfer queue.
 * @returns {Router} Authenticated file routes.
 */
export function createFileRoutes(queue: DownloadQueue): Router {
  const router = Router();
  /**
   * Resolves a manifest index and never accepts a user-controlled disk path.
   * @param {Request} request - Job ID and optional numeric file index.
   * @param {Response} response - Attachment stream.
   * @param {NextFunction} next - Safe central error handling.
   * @returns {Promise<void>} Stream setup after path validation.
   */
  async function serveFile(request: Request, response: Response, next: NextFunction): Promise<void> {
    try {
      const job = queue.store.jobs.find((entry) => entry.id === request.params.jobId);
      if (!job) {
        response.status(HTTP_STATUS.notFound).end();
        return;
      }
      if (job.status !== DOWNLOAD_STATUS.completed) {
        response.status(HTTP_STATUS.conflict).json({ error: 'This download is not ready.' });
        return;
      }
      let filename = queue.store.getFilePath(job.id);
      let displayName = job.filename;
      if (job.files?.length) {
        const fileIndex = request.params.fileIndex === undefined ? 0 : Number(request.params.fileIndex);
        const file = Number.isSafeInteger(fileIndex) && fileIndex >= 0 ? job.files[fileIndex] : undefined;
        if (!file) {
          response.status(HTTP_STATUS.notFound).end();
          return;
        }
        filename = await resolveArtifactPath(queue.store.getOutputDirectory(job), file.relativePath);
        displayName = file.name.split(/[\\/]/).at(-1) ?? file.name;
      } else if (request.params.fileIndex !== undefined) {
        response.status(HTTP_STATUS.notFound).end();
        return;
      }
      response.setHeader('Content-Type', 'application/octet-stream');
      response.download(filename, displayName, { dotfiles: 'allow' }, (error) => {
        if (error && !response.headersSent) {
          next(error);
        }
      });
    } catch (error) {
      next(error);
    }
  }
  router.get(`/:jobId${DOWNLOAD_PATH.file}`, serveFile);
  router.get(`/:jobId${DOWNLOAD_PATH.files}/:fileIndex`, serveFile);
  return router;
}
