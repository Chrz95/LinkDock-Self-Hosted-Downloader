import { Router } from 'express';
import { HTTP_STATUS, DOWNLOAD_STATUS } from '../../shared/contracts.js';
import { DOWNLOAD_QUALITY, SOURCE_TYPE } from '../../shared/sources.js';
import { JOB_OPTIONS } from '../../shared/jobOptions.js';
import type { DownloadQueue } from './queue.js';

/**
 * Applies only fixed workflow options to existing server-owned job IDs.
 * @param {DownloadQueue} queue - Owning queue.
 * @returns {Router} File selection and completion destination routes.
 */
export function createJobOptionsRoutes(queue: DownloadQueue): Router {
  const router = Router();
  for (const option of [
    JOB_OPTIONS.torrent,
    JOB_OPTIONS.destination,
    JOB_OPTIONS.retryMove,
    JOB_OPTIONS.browserLink,
    JOB_OPTIONS.mediaCopy,
  ]) {
    router.post(`/:jobId${option}`, (request, response) => {
      const job = queue.store.jobs.find((item) => item.id === request.params.jobId);
      if (!job) {
        response.status(HTTP_STATUS.notFound).end();
        return;
      }
      try {
        if (option === JOB_OPTIONS.mediaCopy) {
          if (
            job.sourceType !== SOURCE_TYPE.video ||
            !Object.values(DOWNLOAD_QUALITY).some((value) => value === request.body?.quality)
          ) {
            throw new Error('Choose a supported video quality or MP3 bitrate for a video-source job.');
          }
          const copy = queue.add(job.url, SOURCE_TYPE.video, request.body.quality);
          response.status(HTTP_STATUS.created).json({ id: copy.id });
          return;
        }
        if (option === JOB_OPTIONS.browserLink) {
          if (
            (job.status !== DOWNLOAD_STATUS.failed && job.status !== DOWNLOAD_STATUS.cancelled) ||
            job.payloadReady ||
            job.sourceType === SOURCE_TYPE.torrent ||
            job.sourceType === SOURCE_TYPE.magnet
          ) {
            throw new Error('Browser link handoff is available only for failed or canceled file/media jobs.');
          }
          queue.add(request.body?.url, SOURCE_TYPE.direct);
        } else if (option === JOB_OPTIONS.torrent) {
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
