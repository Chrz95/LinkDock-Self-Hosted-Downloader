import 'node:process';
import { loadServerConfig } from './config.js';
import { createApplication } from './app.js';
import { DownloadQueue } from './downloads/queue.js';
import { logger } from '../src/lib/logger/logger.js';
import { NotificationService } from './notifications/service.js';

const configuration = loadServerConfig();
const queue = new DownloadQueue(configuration);
const notifications = new NotificationService(configuration);
const application = createApplication(configuration, queue, notifications);
const server = application.listen(
  configuration.port,
  '0.0.0.0' /**
   * Reports readiness after the HTTP listener has opened.
   */,
  () => {
    logger.info(`LinkDock is listening on port ${configuration.port}.`);
  },
);

/** Closes network listeners and active transfers on container shutdown. */
function handleShutdown(): void {
  void queue.stop().then(() => notifications.stop());
  server.close();
  server.closeIdleConnections();
}
process.once('SIGTERM', handleShutdown);
process.once('SIGINT', handleShutdown);
