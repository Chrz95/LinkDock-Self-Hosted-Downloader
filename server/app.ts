import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { API_PATH, HTTP_METHOD, HTTP_STATUS } from '../shared/contracts.js';
import { logger } from '../src/lib/logger/logger.js';
import type { ServerConfig } from './config.js';
import { LIMIT } from './constants.js';
import type { DownloadQueue } from './downloads/queue.js';
import { createDownloadRoutes } from './downloads/routes.js';
import { createSessionHandlers } from './security/session.js';
import { createPolicyRoutes } from './policy/routes.js';
import { NotificationService } from './notifications/service.js';
import { createNotificationRoutes } from './notifications/routes.js';
import { createHealthRoutes } from './health/routes.js';
import { UTILITY } from '../shared/utilities.js';
import { createUtilityRoutes } from './utilities/routes.js';
import { CONTROL } from '../shared/control.js';
import { createControlRoutes } from './control/routes.js';

/**
 * Composes a same-origin application with private API responses and CSRF origin checks.
 * @param {ServerConfig} configuration - Validated service environment.
 * @param {DownloadQueue} queue - Queue lifecycle owned by the entry point.
 * @param {NotificationService} [notifications] - Optional encrypted browser delivery service.
 * @returns {express.Express} Application usable by the HTTP server and integration tests.
 */
export function createApplication(
  configuration: ServerConfig,
  queue: DownloadQueue,
  notifications = new NotificationService(configuration),
): express.Express {
  const application = express();
  const session = createSessionHandlers(configuration);
  queue.onTerminal((job) => notifications.enqueue(job));
  application.disable('x-powered-by');
  application.use(
    helmet({
      strictTransportSecurity: configuration.secureCookie ? undefined : false,
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: configuration.secureCookie ? [] : null } },
    }),
  );
  application.get(API_PATH.health, (_request, response) => response.json({ status: 'ok' }));
  application.use(
    API_PATH.prefix /**
     * Prevents authenticated API responses from being cached.
     * @param {Request} _request - Unused incoming request.
     * @param {Response} response - HTTP response destination.
     * @param {NextFunction} next - Continues middleware or propagates an error.
     */,
    (_request, response, next) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  application.use(
    API_PATH.prefix /**
     * Rejects cross-origin or non-JSON mutations before parsing their payload.
     * @param {Request} request - Incoming request.
     * @param {Response} response - HTTP response destination.
     * @param {NextFunction} next - Continues middleware or propagates an error.
     */,
    (request, response, next) => {
      const { origin } = request.headers;
      const expectedOrigin = configuration.publicOrigin ?? `${request.protocol}://${request.get('host')}`;
      if (
        request.method !== HTTP_METHOD.get &&
        request.method !== HTTP_METHOD.head &&
        ((origin && origin !== expectedOrigin) || !request.is('application/json'))
      ) {
        response.status(HTTP_STATUS.forbidden).json({ error: 'Request origin or content type was rejected.' });
        return;
      }
      next();
    },
  );
  application.use(express.json({ limit: LIMIT.maximumBodyBytes }));
  application.post(
    API_PATH.session,
    rateLimit({
      windowMs: LIMIT.loginWindowMilliseconds,
      limit: LIMIT.loginAttempts,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many unlock attempts. Try again in 15 minutes.' },
    }),
    session.login,
  );
  application.delete(API_PATH.session, session.requireSession, session.logout);
  application.use(API_PATH.downloads, session.requireSession, createDownloadRoutes(queue));
  application.use(UTILITY.path, session.requireSession, createUtilityRoutes(queue.utilities));
  application.use(CONTROL.path, session.requireSession, createControlRoutes(queue));
  application.use(API_PATH.settings, session.requireSession, createPolicyRoutes(queue));
  application.use(API_PATH.notifications, session.requireSession, createNotificationRoutes(notifications));
  application.use(API_PATH.station, session.requireSession, createHealthRoutes(configuration, queue));
  application.use(API_PATH.prefix, (_request, response) =>
    response.status(HTTP_STATUS.notFound).json({ error: 'Not found.' }),
  );
  if (configuration.isProduction) {
    application.use(express.static(path.resolve('dist')));
  }
  application.use(handleApplicationError);
  return application;
}

/**
 * Keeps internal paths and stack traces out of HTTP error responses.
 * @param {unknown} error - Express or filesystem error.
 * @param {Request} _request - Failed request.
 * @param {Response} response - Safe error response.
 * @param {NextFunction} next - Default handler if headers were already sent.
 */
function handleApplicationError(error: unknown, _request: Request, response: Response, next: NextFunction): void {
  logger.error('HTTP request failed.', error);
  if (response.headersSent) {
    next(error);
    return;
  }
  const isInvalidJson = error instanceof SyntaxError;
  response
    .status(isInvalidJson ? HTTP_STATUS.badRequest : HTTP_STATUS.serverError)
    .json({ error: isInvalidJson ? 'The request body is invalid.' : 'The request failed. Check the service logs.' });
}
