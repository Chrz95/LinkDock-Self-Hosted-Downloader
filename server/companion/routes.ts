import { Router } from 'express';
import { setTimeout as delay } from 'node:timers/promises';
import { rateLimit } from 'express-rate-limit';
import { COMPANION, EXTENSION_ORIGIN } from '../../shared/companion.js';
import { DOWNLOAD_STATUS, HTTP_METHOD, HTTP_STATUS, type DownloadJob } from '../../shared/contracts.js';
import { SOURCE_TYPE } from '../../shared/sources.js';
import type { DownloadQueue } from '../downloads/queue.js';
import type { CompanionStore } from './store.js';

/** Owner-only creation, metadata and revocation remain behind the ordinary station-session and CSRF boundary.
 * @param {CompanionStore} store - Private credential registry.
 * @returns {Router} Authenticated station UI routes.
 */
export function createCompanionRoutes(store: CompanionStore): Router {
  const router = Router();
  router.get('/', (_request, response) => response.json({ connections: store.list() }));
  router.post('/', (request, response) => {
    try {
      response.status(HTTP_STATUS.created).json(store.create(request.body?.extensionOrigin));
    } catch {
      response.status(HTTP_STATUS.badRequest).json({
        error: 'Could not pair this companion. Check the extension and revoke unused connections in Settings.',
      });
    }
  });
  router.delete('/:id', (request, response) => {
    store.revoke(String(request.params.id));
    response.status(HTTP_STATUS.noContent).end();
  });
  return router;
}

/**
 * Observes the job from this submission only, without another request to the file host.
 * @param {DownloadJob} job - Newly queued direct transfer and its live progress.
 * @param {AbortSignal} signal - Deadline or disconnected companion.
 * @returns {Promise<boolean>} Whether the station began receiving file bytes or completed the file.
 */
async function captureSourceStarted(job: DownloadJob, signal: AbortSignal): Promise<boolean> {
  while (!signal.aborted) {
    if (job.status === DOWNLOAD_STATUS.completed || (job.status === DOWNLOAD_STATUS.downloading && job.receivedBytes)) {
      return true;
    }
    if (
      (job.status !== DOWNLOAD_STATUS.queued && job.status !== DOWNLOAD_STATUS.downloading) ||
      job.retry?.nextAttemptAt
    ) {
      break;
    }
    await delay(COMPANION.capturePollMilliseconds, undefined, { signal }).catch(() => undefined);
  }
  return false;
}

/** Separate extension-only API grants queue submission and self-revocation, never station-session authority.
 * @param {CompanionStore} store - Bearer verification and revocation registry.
 * @param {DownloadQueue} queue - Validated existing queue insertion.
 * @returns {Router} Narrow cross-origin API with no cookie authentication or arbitrary CORS origins.
 */
export function createCompanionClientRoutes(store: CompanionStore, queue: DownloadQueue): Router {
  const router = Router();
  router.use(
    rateLimit({
      windowMs: COMPANION.requestWindowMilliseconds,
      limit: COMPANION.requestsPerWindow,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many companion requests. Try again shortly.' },
    }),
  );
  router.use((request, response, next) => {
    const origin = request.get('Origin');
    const extension = request.get('X-LinkDock-Extension');
    if (
      (origin && !EXTENSION_ORIGIN.test(origin)) ||
      (extension && !EXTENSION_ORIGIN.test(extension)) ||
      (origin && extension && origin !== extension)
    ) {
      response.status(HTTP_STATUS.forbidden).json({ error: 'Companion origin rejected.' });
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.vary('Origin');
    }
    if (request.method === 'OPTIONS') {
      if (!origin) {
        response.status(HTTP_STATUS.forbidden).end();
        return;
      }
      response.setHeader('Access-Control-Allow-Methods', 'POST, DELETE');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-LinkDock-Extension');
      response.status(HTTP_STATUS.noContent).end();
      return;
    }
    const token = request.get('Authorization')?.match(/^Bearer (ldc_[a-f\d]{64})$/u)?.[1];
    const connection = store.authorize(token, extension);
    if (!connection || (request.method === HTTP_METHOD.post && !request.is('application/json'))) {
      response.status(HTTP_STATUS.unauthorized).json({ error: 'Reconnect the companion from your signed-in station.' });
      return;
    }
    response.locals.connectionId = connection.id;
    next();
  });
  router.post('/downloads', async (request, response) => {
    const capture = request.body?.browserCapture === true;
    let job: DownloadJob;
    try {
      job = queue.add(
        request.body?.url,
        capture ? SOURCE_TYPE.direct : request.body?.sourceType,
        request.body?.quality,
      );
    } catch {
      response
        .status(HTTP_STATUS.badRequest)
        .json({ error: 'Link or options rejected. Check the library for duplicates.' });
      return;
    }
    if (!capture) {
      response.status(HTTP_STATUS.created).json({ accepted: true });
      return;
    }
    const controller = new AbortController();
    response.once('close', () => controller.abort());
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(COMPANION.captureWaitMilliseconds)]);
    const sourceStarted = await captureSourceStarted(job, signal);
    if (!response.destroyed) {
      response.status(HTTP_STATUS.created).json({ accepted: true, sourceStarted });
    }
  });
  router.delete('/connection', (_request, response) => {
    store.revoke(response.locals.connectionId as string);
    response.status(HTTP_STATUS.noContent).end();
  });
  router.use((_request, response) => response.status(HTTP_STATUS.notFound).json({ error: 'Not found.' }));
  return router;
}
