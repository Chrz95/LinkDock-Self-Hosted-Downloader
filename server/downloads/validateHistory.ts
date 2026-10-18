import { DOWNLOAD_STATUS, type DownloadJob } from '../../shared/contracts.js';
import { LIMIT } from '../constants.js';
import { resolveDownloadRequest } from '../engines/detectSource.js';
import { ENGINE_LIMIT } from '../engines/constants.js';
import { SOURCE_TYPE, SOURCE_URL } from '../../shared/sources.js';
import { STRONG_ETAG, MAXIMUM_ETAG_LENGTH } from './resume.js';
import { parseTargetUrl } from '../security/target.js';
import { JOB_PRIORITY } from '../../shared/batch.js';
import { validateLibraryMetadata, type LibraryMetadata } from '../../shared/library.js';
import { validateJobOptions } from './validateJobOptions.js';

/** Storage IDs are generated UUIDs and may never contain filesystem separators. */
const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * Checks a persisted byte field before queue logic treats it as a quantity.
 * @param {unknown} value - Parsed JSON field.
 * @returns {boolean} Whether the field is a finite, nonnegative number.
 */
function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Verifies persisted records before any value can become a filesystem path.
 * @param {unknown} value - One parsed history entry.
 * @returns {boolean} Whether the entry satisfies the persisted contract.
 */
function isDownloadJob(value: unknown): value is DownloadJob {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    !UUID_PATTERN.test(record.id) ||
    typeof record.url !== 'string' ||
    typeof record.filename !== 'string' ||
    !Object.values(DOWNLOAD_STATUS).some((status) => status === record.status) ||
    !isNonnegativeNumber(record.receivedBytes) ||
    !isNonnegativeNumber(record.bytesPerSecond) ||
    (record.totalBytes !== null && !isNonnegativeNumber(record.totalBytes)) ||
    typeof record.createdAt !== 'string' ||
    (record.finishedAt !== null && typeof record.finishedAt !== 'string') ||
    (record.errorMessage !== null && typeof record.errorMessage !== 'string') ||
    (record.resumeValidator !== undefined &&
      (typeof record.resumeValidator !== 'string' ||
        record.resumeValidator.length > MAXIMUM_ETAG_LENGTH ||
        !STRONG_ETAG.test(record.resumeValidator)))
  ) {
    return false;
  }
  try {
    validateJobOptions(record);
    if (record.library !== undefined) {
      const normalized = validateLibraryMetadata(record.library);
      const metadata = record.library as LibraryMetadata;
      if (metadata.folder !== normalized.folder || JSON.stringify(metadata.tags) !== JSON.stringify(normalized.tags)) {
        return false;
      }
    }
    if (
      record.priority !== undefined &&
      !Object.values(JOB_PRIORITY).some((priority) => priority === record.priority)
    ) {
      return false;
    }
    if (record.resumeSourceUrl !== undefined) {
      if (typeof record.resumeSourceUrl !== 'string' || record.resumeSourceUrl.length > LIMIT.maximumUrlLength) {
        return false;
      }
      parseTargetUrl(record.resumeSourceUrl);
    }
    if (
      record.files !== undefined &&
      (!Array.isArray(record.files) ||
        record.files.length > ENGINE_LIMIT.maximumFiles ||
        !record.files.every((file: unknown) => {
          if (!file || typeof file !== 'object') {
            return false;
          }
          const artifact = file as Record<string, unknown>;
          return (
            typeof artifact.name === 'string' &&
            typeof artifact.relativePath === 'string' &&
            isNonnegativeNumber(artifact.sizeBytes)
          );
        }))
    ) {
      return false;
    }
    if (record.url === `${SOURCE_URL.uploadedTorrent}${record.id}` && record.sourceType === SOURCE_TYPE.torrent) {
      return true;
    }
    resolveDownloadRequest(record.url, record.sourceType, record.quality);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fails closed on corrupt history, including duplicate IDs and traversal attempts.
 * @param {unknown} value - JSON content from the state volume.
 * @returns {DownloadJob[]} Validated transfer records.
 * @throws {Error} When persisted state cannot be safely recovered.
 */
export function validateHistory(value: unknown): DownloadJob[] {
  if (
    !Array.isArray(value) ||
    value.length > LIMIT.maximumHistory ||
    !value.every(isDownloadJob) ||
    new Set(value.map((job) => job.id)).size !== value.length
  ) {
    throw new Error('History is invalid. Restore history.json from a backup before restarting.');
  }
  return value;
}
