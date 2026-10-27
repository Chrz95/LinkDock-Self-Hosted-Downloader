import { Router } from 'express';
import { LIMIT } from '../constants.js';
import { DIAGNOSTICS, type DiagnosticCheck, type DownloadDiagnostic } from '../../shared/diagnostics.js';
import { DOWNLOAD_STATUS, HTTP_STATUS, type DownloadJob } from '../../shared/contracts.js';
import { MEDIA_DNS_MODE } from '../../shared/mediaDns.js';
import { SOURCE_TYPE } from '../../shared/sources.js';
import type { ServerConfig } from '../config.js';
import type { DownloadQueue } from '../downloads/queue.js';
import { readStationHealth } from '../health/routes.js';
import { inspectPage } from './page.js';
import { inspectSession } from './session.js';
import { inspectDownloadEngine } from './engine.js';

/** Builds a bounded report without changing the job, token caches or stored browser sessions.
 * @param {DownloadJob} job - Snapshot of one failed transfer.
 * @param {ServerConfig} configuration - Station settings.
 * @param {DownloadQueue} queue - Storage inspection only.
 * @param {AbortSignal} signal - Whole diagnostic deadline and client cancellation.
 * @returns {Promise<DownloadDiagnostic>} Credential-safe, exportable report.
 */
export async function inspectDownload(
  job: DownloadJob,
  configuration: ServerConfig,
  queue: DownloadQueue,
  signal: AbortSignal,
): Promise<DownloadDiagnostic> {
  const direct = !job.sourceType || job.sourceType === SOURCE_TYPE.direct;
  const checks: DiagnosticCheck[] = [];
  const health = readStationHealth(configuration, queue, []);
  const storageOkay =
    health.storage.writable &&
    health.storage.availableBytes !== null &&
    health.storage.availableBytes > queue.policy.settings.reserveGib * LIMIT.bytesPerGibibyte;
  checks.push({
    id: 'storage',
    label: 'Download storage',
    state: storageOkay ? 'passed' : 'failed',
    detail: storageOkay
      ? 'Storage permissions and the free-space buffer passed. ' +
        'This does not test final file placement or disk integrity.'
      : 'Storage is unwritable, unavailable or below its free-space buffer. Review the mount and storage settings.',
    action: 'settings',
  });
  const engines = inspectDownloadEngine(job, configuration, signal).catch((): DiagnosticCheck[] => [
    {
      id: 'engine',
      label: 'Download engine',
      state: 'failed',
      detail: 'The active engine check could not finish. Review utilities in Settings.',
      action: 'settings',
    },
  ]);
  try {
    const session = inspectSession(job, configuration);
    checks.push(session.check);
    checks.push(...(await inspectPage(job.url, configuration, !direct, session.access, signal)));
  } catch {
    checks.push({
      id: 'session',
      label: 'Saved account access',
      state: 'failed',
      detail: 'Saved session settings could not be read safely. Review browser sessions and account settings.',
      action: 'settings',
    });
  }
  checks.push(...(await engines));
  return {
    diagnostic: 'LD-DOWNLOAD-1',
    checkedAt: new Date().toISOString(),
    sourceType: job.sourceType ?? SOURCE_TYPE.direct,
    dnsMode: direct ? MEDIA_DNS_MODE.system : (configuration.mediaDnsMode ?? MEDIA_DNS_MODE.system),
    previousFailure: job.mediaFailure ?? null,
    checks,
  };
}

/** Mounts session-protected diagnostics with one active probe per station and bounded, short-lived results.
 * @param {ServerConfig} configuration - Validated station settings.
 * @param {DownloadQueue} queue - Existing job registry.
 * @returns {Router} Explicit POST check; arbitrary URLs and engine arguments are never accepted.
 */
export function createDiagnosticRoutes(configuration: ServerConfig, queue: DownloadQueue): Router {
  const router = Router();
  const cached = new Map<string, { report: DownloadDiagnostic; expiresAt: number }>();
  let active = false;
  router.post(`/:jobId${DIAGNOSTICS.path}`, async (request, response) => {
    const job = queue.store.jobs.find((entry) => entry.id === request.params.jobId);
    if (!job) {
      response.status(HTTP_STATUS.notFound).json({ error: 'Download not found.' });
      return;
    }
    if (
      job.status !== DOWNLOAD_STATUS.failed ||
      job.sourceType === SOURCE_TYPE.torrent ||
      job.sourceType === SOURCE_TYPE.magnet
    ) {
      response
        .status(HTTP_STATUS.conflict)
        .json({ error: 'Connection checks are available for failed file and media downloads.' });
      return;
    }
    for (const [id, entry] of cached) {
      if (Date.now() >= entry.expiresAt) {
        cached.delete(id);
      }
    }
    const previous = cached.get(job.id);
    if (previous) {
      response.json(previous.report);
      return;
    }
    if (active) {
      response.status(HTTP_STATUS.conflict).json({ error: 'Another connection check is running. Try again shortly.' });
      return;
    }
    active = true;
    const controller = new AbortController();
    response.on('close', () => controller.abort());
    const timeout = setTimeout(() => controller.abort(), DIAGNOSTICS.timeoutMilliseconds);
    try {
      const report = await inspectDownload({ ...job }, configuration, queue, controller.signal);
      if (!response.destroyed) {
        if (cached.size >= DIAGNOSTICS.maximumCachedReports) {
          cached.delete(cached.keys().next().value!);
        }
        cached.set(job.id, { report, expiresAt: Date.now() + DIAGNOSTICS.cacheMilliseconds });
        response.json(report);
      }
    } catch {
      if (!response.destroyed) {
        response
          .status(HTTP_STATUS.serverError)
          .json({ error: 'The connection check could not finish. Try again shortly.' });
      }
    } finally {
      clearTimeout(timeout);
      active = false;
    }
  });
  return router;
}
