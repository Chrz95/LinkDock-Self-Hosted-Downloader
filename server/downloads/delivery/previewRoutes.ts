import { Router, type Request, type Response, type NextFunction } from 'express';
import { pipeline } from 'node:stream/promises';
import { DOWNLOAD_PATH, HTTP_METHOD, HTTP_STATUS } from '../../../shared/contracts.js';
import { DELIVERY_LIMIT } from '../../../shared/media.js';
import type { DownloadQueue } from '../queue.js';
import { FileDeliveryError, openPublishedFile } from './publishedFile.js';
import { inspectPreview } from './mediaHeader.js';
import { resolveByteRange } from './range.js';

/**
 * Serves only recognized media from the validated descriptor, with byte seeking and no private caching.
 * @param {DownloadQueue} queue - Owner queue.
 * @returns {Router} Routes mounted inside the authenticated job router.
 */
export function createPreviewRoutes(queue: DownloadQueue): Router {
  const router = Router();
  /**
   * Validates a file before sending headers or streaming native media bytes.
   * @param {Request} request - Owner-selected job and optional manifest index.
   * @param {Response} response - Inline media delivery.
   * @param {NextFunction} next - Central safe error handling.
   * @returns {Promise<void>} Descriptor released after delivery, failure or disconnect.
   */
  async function preview(request: Request, response: Response, next: NextFunction): Promise<void> {
    const job = queue.store.jobs.find((entry) => entry.id === request.params.jobId);
    if (!job) {
      response.status(HTTP_STATUS.notFound).end();
      return;
    }
    let file: Awaited<ReturnType<typeof openPublishedFile>> | undefined;
    try {
      file = await openPublishedFile(queue, job, request.params.fileIndex as string | undefined);
      const { size } = file.information;
      const format = await inspectPreview(file.handle, file.displayName, size);
      const range = resolveByteRange(
        request.method === HTTP_METHOD.head || request.headers['if-range'] ? undefined : request.headers.range,
        size,
      );
      if (!range) {
        response.setHeader('Content-Range', `bytes */${size}`);
        throw new FileDeliveryError(HTTP_STATUS.rangeNotSatisfiable, 'Request one valid byte range.');
      }
      response.status(range.isPartial ? HTTP_STATUS.partialContent : HTTP_STATUS.ok);
      response.set({
        'Content-Type': format.mime,
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store',
        'Content-Length': String(Math.max(0, range.end - range.start + 1)),
        'Accept-Ranges': 'bytes',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      if (range.isPartial) {
        response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      }
      if (request.method === HTTP_METHOD.head || !size) {
        response.end();
        return;
      }
      response.setTimeout(DELIVERY_LIMIT.idleMilliseconds, () => response.destroy());
      await pipeline(
        file.handle.createReadStream({
          start: range.start,
          end: range.end,
          autoClose: false,
          highWaterMark: DELIVERY_LIMIT.streamBufferBytes,
        }),
        response,
      );
    } catch (error) {
      if (response.headersSent || response.destroyed) {
        response.destroy();
      } else if (error instanceof FileDeliveryError) {
        response.status(error.status).json({ error: error.message });
      } else {
        next(error);
      }
    } finally {
      await file?.handle.close();
    }
  }
  router.get(`/:jobId${DOWNLOAD_PATH.preview}`, preview);
  router.get(`/:jobId${DOWNLOAD_PATH.preview}/:fileIndex`, preview);
  return router;
}
