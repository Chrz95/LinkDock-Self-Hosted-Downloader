import { accessSync, constants } from 'node:fs';
import { Router } from 'express';
import type { ServerConfig } from '../config.js';
import type { DownloadQueue } from '../downloads/queue.js';
import { DOWNLOAD_STATUS } from '../../shared/contracts.js';
import type { EngineHealth, StationHealthSnapshot, SystemHealth } from '../../shared/health.js';
import { EngineInspector } from './engines.js';
import { SystemInspector } from './system.js';

/**
 * Degrades cleanly when a restricted runtime cannot read resident process memory.
 * @returns {number | null} Actual RSS bytes, or explicit unavailability.
 */
function readMemoryBytes(): number | null {
  try {
    return process.memoryUsage().rss;
  } catch {
    return null;
  }
}

/**
 * Reads actual process and storage state without probing providers or exposing original links and paths.
 * @param {ServerConfig} configuration - Validated station environment.
 * @param {DownloadQueue} queue - Live owner queue.
 * @param {EngineHealth[]} engines - Bounded version checks.
 * @param {SystemHealth} [system] - Independently sampled OS-visible measurements.
 * @returns {StationHealthSnapshot} Owner-only station diagnostics.
 */
export function readStationHealth(
  configuration: ServerConfig,
  queue: DownloadQueue,
  engines: EngineHealth[],
  system?: SystemHealth,
): StationHealthSnapshot {
  let storage: StationHealthSnapshot['storage'] = {
    availableBytes: null,
    totalBytes: null,
    writable: false,
    detail: 'Storage unavailable. Check the data mount, free space and UID 1000 ownership.',
  };
  let holdReason: string | null = null;
  try {
    const snapshot = queue.snapshot();
    storage = { ...storage, ...snapshot.storage };
    holdReason = snapshot.policy?.holdReason ?? null;
    accessSync(configuration.dataDirectory, constants.W_OK);
    accessSync(queue.store.filesDirectory, constants.W_OK);
    storage.writable = true;
    storage.detail = 'Directory permissions allow writes. This is a snapshot, not a disk integrity or quota check.';
  } catch {
    /* Preserve a safe diagnostic even when the filesystem is temporarily unavailable. */
  }
  /**
   * Counts a single lifecycle state without disclosing records.
   * @param {string} status - Known queue lifecycle state.
   * @returns {number} Matching jobs.
   */
  const count = (status: string) => queue.store.jobs.filter((job) => job.status === status).length;
  return {
    checkedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryBytes: readMemoryBytes(),
    },
    storage,
    queue: {
      active: count(DOWNLOAD_STATUS.downloading),
      waiting: count(DOWNLOAD_STATUS.queued),
      paused: count(DOWNLOAD_STATUS.paused),
      holdReason,
    },
    engines,
    system,
  };
}

/**
 * Adds lazy diagnostics behind the existing session boundary and response-cache policy.
 * @param {ServerConfig} configuration - Station environment.
 * @param {DownloadQueue} queue - Live queue.
 * @param {EngineInspector} [inspector] - Coalesced, cached command checks.
 * @param {SystemInspector} [systemInspector] - Cached bounded system measurements.
 * @returns {Router} Owner-only read routes.
 */
export function createHealthRoutes(
  configuration: ServerConfig,
  queue: DownloadQueue,
  inspector = new EngineInspector(configuration.dataDirectory, configuration.runtimeEnvironment),
  systemInspector = new SystemInspector(),
): Router {
  const router = Router();
  router.get('/', async (_request, response) => {
    const [engines, system] = await Promise.all([inspector.inspect(), systemInspector.inspect()]);
    response.json(readStationHealth(configuration, queue, engines, system));
  });
  return router;
}
