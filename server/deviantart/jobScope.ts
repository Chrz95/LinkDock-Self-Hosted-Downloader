import { existsSync, readdirSync } from 'node:fs';
import { DEVIANTART } from '../../shared/deviantart.js';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../shared/contracts.js';
import { SOURCE_TYPE } from '../../shared/sources.js';
import { OUTPUT } from '../engines/constants.js';
import { safeDirectory } from '../downloads/completion/paths.js';
import type { DownloadStore } from '../downloads/store.js';
import { DeviantartStore } from './store.js';
import { validateDeviantartPreferences } from './validation.js';
/**
 * Reads only canonical public collection choices, never account fields.
 * @param {string} dataDirectory - Private station root.
 * @returns {import('../../shared/deviantart.js').DeviantartPreferences} Independent collection snapshot.
 */
export function readCollectionPreferences(dataDirectory: string) {
  return validateDeviantartPreferences(new DeviantartStore(dataDirectory).read());
}
/**
 * Detects old partial collections whose original scope cannot be reconstructed reliably.
 * @param {DownloadJob} job - Existing history record.
 * @param {DownloadStore} store - Validated staging paths.
 * @returns {boolean} Whether explicit restart is required before collecting more files.
 */
export function needsCollectionRestart(job: DownloadJob, store: DownloadStore): boolean {
  if (job.sourceType !== SOURCE_TYPE.deviantart || job.deviantart || job.payloadReady) {
    return false;
  }
  const working = `${store.getFilePath(job.id)}${OUTPUT.workingSuffix}`;
  return existsSync(working) && readdirSync(safeDirectory(working)).length > 0;
}
/**
 * Preserves ambiguous legacy partial bytes without automatically appending files using changed global choices.
 * @param {DownloadStore} store - Restored history and staging root.
 */
export function holdLegacyCollections(store: DownloadStore): void {
  let changed = false;
  for (const job of store.jobs) {
    if (
      (job.status === DOWNLOAD_STATUS.queued || job.status === DOWNLOAD_STATUS.paused) &&
      needsCollectionRestart(job, store)
    ) {
      job.status = DOWNLOAD_STATUS.paused;
      job.stage = DEVIANTART.legacyStage;
      job.bytesPerSecond = 0;
      changed = true;
    }
  }
  if (changed) {
    store.save();
  }
}
