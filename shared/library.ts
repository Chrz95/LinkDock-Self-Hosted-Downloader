/** Logical organization is stored in history and never used as a filesystem path. */
export interface LibraryMetadata {
  folder: string;
  tags: string[];
}
/** Optional library edits use complete replacement of one job's folder and tags. */
export type OrganizeDownload = (jobId: string, metadata: LibraryMetadata) => Promise<void>;
/** Bounded labels keep history and touch controls manageable. */
export const LIBRARY_LIMIT = { folderCharacters: 64, tagCharacters: 32, tags: 8, inputCharacters: 512 } as const;
/** Filtering identifiers cannot collide with user-defined folder names. */
export const LIBRARY_FILTER = { all: '', unfiled: 'unfiled', folderPrefix: 'folder:' } as const;
/** Controls and path separators are excluded from plain organization labels. */
const UNSAFE_LABEL = /[\p{Cc}/\\]/u;

/**
 * Normalizes bounded Unicode labels without accepting path or control syntax.
 * @param {unknown} value - Submitted folder or tag.
 * @param {number} maximum - Canonical character limit.
 * @returns {string} Trimmed label with collapsed whitespace.
 */
function normalizeLabel(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > LIBRARY_LIMIT.inputCharacters || UNSAFE_LABEL.test(value)) {
    throw new Error('Use plain labels without slashes or control characters.');
  }
  const label = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (label.length > maximum || label === '.' || label === '..') {
    throw new Error(`Labels must be at most ${maximum} characters and cannot be dot paths.`);
  }
  return label;
}

/**
 * Validates the entire edit before returning isolated, canonical folder and tag values.
 * @param {unknown} input - Untrusted request or persisted metadata.
 * @returns {LibraryMetadata} Whitelisted organization fields.
 */
export function validateLibraryMetadata(input: unknown): LibraryMetadata {
  if (!input || typeof input !== 'object') {
    throw new Error('Provide a folder and tags for this download.');
  }
  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.tags) || record.tags.length > LIBRARY_LIMIT.tags) {
    throw new Error(`Choose up to ${LIBRARY_LIMIT.tags} tags.`);
  }
  const folder = normalizeLabel(record.folder, LIBRARY_LIMIT.folderCharacters);
  const tags: string[] = [];
  const known = new Set<string>();
  for (const value of record.tags) {
    const tag = normalizeLabel(value, LIBRARY_LIMIT.tagCharacters);
    if (!tag || tag.includes(',')) {
      throw new Error('Use nonempty tags without commas.');
    }
    if (!known.has(tag.toLowerCase())) {
      known.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return { folder, tags };
}
