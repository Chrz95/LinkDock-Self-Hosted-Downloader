import { Router } from 'express';
import { HTTP_STATUS } from '../../shared/contracts.js';
import { NOTIFICATION_PATH } from '../../shared/notifications.js';
import type { NotificationService } from './service.js';

/**
 * Protects registration, removal and test actions with the application's existing session and origin middleware.
 * @param {NotificationService} notifications - Optional station push service.
 * @returns {Router} Owner-only notification controls.
 */
export function createNotificationRoutes(notifications: NotificationService): Router {
  const router = Router();
  router.get(NOTIFICATION_PATH.outbox, (_request, response) => response.json(notifications.deliveryStatus()));
  router.delete(NOTIFICATION_PATH.outbox, (_request, response) => {
    try {
      notifications.clearOutbox();
      response.status(HTTP_STATUS.noContent).end();
    } catch {
      response
        .status(HTTP_STATUS.conflict)
        .json({ error: 'Pending alerts could not be cleared. Check station storage.' });
    }
  });
  router.get('/', (_request, response) => response.json(notifications.configurationForBrowser()));
  router.post(NOTIFICATION_PATH.status, (request, response) => {
    response.json({ subscribed: notifications.has(request.body?.endpoint) });
  });
  router.post(NOTIFICATION_PATH.subscription, async (request, response) => {
    try {
      await notifications.register(request.body);
      response.status(HTTP_STATUS.noContent).end();
    } catch (error) {
      response
        .status(HTTP_STATUS.badRequest)
        .json({ error: error instanceof Error ? error.message : 'Registration failed.' });
    }
  });
  router.post(NOTIFICATION_PATH.unsubscribe, (request, response) => {
    try {
      notifications.unregister(request.body?.endpoint);
      response.status(HTTP_STATUS.noContent).end();
    } catch {
      response.status(HTTP_STATUS.badRequest).json({ error: 'This browser registration could not be removed.' });
    }
  });
  router.post(NOTIFICATION_PATH.test, async (request, response) => {
    try {
      await notifications.test(request.body?.endpoint);
      response.status(HTTP_STATUS.noContent).end();
    } catch (error) {
      response
        .status(HTTP_STATUS.badRequest)
        .json({ error: error instanceof Error ? error.message : 'Test alert failed.' });
    }
  });
  return router;
}
