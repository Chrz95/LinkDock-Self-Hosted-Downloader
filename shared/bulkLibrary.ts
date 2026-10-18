import { DOWNLOAD_STATUS, type DownloadJob } from './contracts.js';
import { validateLibraryMetadata, type LibraryMetadata } from './library.js';

/** Bulk requests have a fixed, explicitly reviewed membership. */
export const BULK_LIBRARY = { maximum: 50, path: '/bulk', confirmation: 'delete-selected-files' } as const;
/** Stable operation identifiers shared by the form and API. */
export const BULK_ACTION = { organize: 'organize', delete: 'delete' } as const;
/** Leaving tags unchanged is represented by omitting the tag operation. */
export const TAG_MODE = { add: 'add', remove: 'remove', replace: 'replace' } as const;
export type TagMode = (typeof TAG_MODE)[keyof typeof TAG_MODE];
/** Omitted fields preserve each selected record's existing values. */
export interface BulkOrganization {
  action: typeof BULK_ACTION.organize;
  ids: string[];
  folder?: string;
  tagMode?: TagMode;
  tags?: string[];
}
/** Destructive requests are created only after a separate review. */
export interface BulkDeletion {
  action: typeof BULK_ACTION.delete;
  ids: string[];
  confirmation: typeof BULK_LIBRARY.confirmation;
}
export type BulkLibraryRequest = BulkOrganization | BulkDeletion;
/** File deletion is sequential; any failed records remain available for a deliberate retry. */
export interface BulkLibraryResult {
  updatedIds: string[];
  deletedIds: string[];
  failures: { id: string; message: string }[];
}
export type MutateLibrary = (request: BulkLibraryRequest) => Promise<BulkLibraryResult>;
/** UUID syntax is checked before resolving the complete selection against retained history. */
const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * Validates a bounded unique selection and every operation field before accessing any job.
 * @param {unknown} input - Untrusted JSON request.
 * @returns {BulkLibraryRequest} Canonical whitelisted request.
 */
export function validateBulkLibrary(input: unknown): BulkLibraryRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('Provide a bulk library action.');
  }
  const record = input as Record<string, unknown>;
  const { ids } = record;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > BULK_LIBRARY.maximum ||
    ids.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error(`Select between 1 and ${BULK_LIBRARY.maximum} different downloads.`);
  }
  if (record.action === BULK_ACTION.delete && record.confirmation === BULK_LIBRARY.confirmation) {
    return { action: BULK_ACTION.delete, ids: [...ids], confirmation: BULK_LIBRARY.confirmation };
  }
  if (record.action !== BULK_ACTION.organize || (record.folder === undefined && record.tagMode === undefined)) {
    throw new Error('Choose a label change or explicitly confirm deletion.');
  }
  if (
    (record.folder !== undefined && typeof record.folder !== 'string') ||
    (record.tagMode !== undefined && !Object.values(TAG_MODE).some((mode) => mode === record.tagMode)) ||
    (record.tagMode !== undefined && !Array.isArray(record.tags)) ||
    (record.tagMode === undefined && record.tags !== undefined)
  ) {
    throw new Error('Choose a supported tag operation.');
  }
  const metadata = validateLibraryMetadata({ folder: record.folder ?? '', tags: record.tags ?? [] });
  return {
    action: BULK_ACTION.organize,
    ids: [...ids],
    ...(record.folder === undefined ? {} : { folder: metadata.folder }),
    ...(record.tagMode === undefined ? {} : { tagMode: record.tagMode as TagMode, tags: metadata.tags }),
  };
}

/**
 * Validates the final merged labels, including the per-job tag limit, before a transaction starts.
 * @param {LibraryMetadata | undefined} current - Existing labels or legacy unfiled record.
 * @param {BulkOrganization} edit - Validated partial label operation.
 * @returns {LibraryMetadata} Complete canonical replacement for one record.
 */
export function mergeBulkOrganization(current: LibraryMetadata | undefined, edit: BulkOrganization): LibraryMetadata {
  const existing = current?.tags ?? [];
  const submitted = edit.tags ?? [];
  const removed = new Set(submitted.map((tag) => tag.toLowerCase()));
  const added = new Map(existing.map((tag) => [tag.toLowerCase(), tag]));
  for (const tag of submitted) {
    if (!added.has(tag.toLowerCase())) {
      added.set(tag.toLowerCase(), tag);
    }
  }
  const tags =
    edit.tagMode === TAG_MODE.replace
      ? submitted
      : edit.tagMode === TAG_MODE.add
        ? [...added.values()]
        : edit.tagMode === TAG_MODE.remove
          ? existing.filter((tag) => !removed.has(tag.toLowerCase()))
          : existing;
  return validateLibraryMetadata({ folder: edit.folder ?? current?.folder ?? '', tags });
}

/**
 * Limits bulk deletion to finished records, including failures and explicit cancellations.
 * @param {DownloadJob} job - Current record, checked again by the server at commit time.
 * @returns {boolean} Whether the transfer has a terminal status.
 */
export function isBulkDeletable(job: DownloadJob): boolean {
  return (
    job.status === DOWNLOAD_STATUS.completed ||
    job.status === DOWNLOAD_STATUS.failed ||
    job.status === DOWNLOAD_STATUS.cancelled
  );
}
