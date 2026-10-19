import { randomUUID } from 'node:crypto';
import { MAXIMUM_BATCH_LINKS, JOB_PRIORITY } from '../../shared/batch.js';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../shared/contracts.js';
import { SOURCE_TYPE, VIDEO_QUALITY } from '../../shared/sources.js';
import { defaultDeviantartPreferences, type DeviantartPreferences } from '../../shared/deviantart.js';
import { validateDeviantartPreferences } from '../deviantart/validation.js';
import { LIMIT } from '../constants.js';
import { resolveDownloadRequest } from '../engines/detectSource.js';

/** Resolved request shared by single and batch queue creation. */
type ResolvedRequest = ReturnType<typeof resolveDownloadRequest> & { deviantart?: DeviantartPreferences };
/** Units for converting equivalent base32 magnet hashes into canonical hexadecimal. */
const HASH_UNIT = { bitsPerCharacter: 5, bitsPerByte: 8, byteMask: 255 } as const;
/** BitTorrent's base32 alphabet. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Identifies equivalent resolved requests without dropping signed HTTP query parameters.
 * @param {DownloadJob | ResolvedRequest} request - Validated request or existing history entry.
 * @returns {string} Source, representation and content identity.
 */
function identity(request: DownloadJob | ResolvedRequest): string {
  const source = request.sourceType ?? SOURCE_TYPE.direct;
  let { url } = request;
  if (source === SOURCE_TYPE.magnet) {
    const hash = new URL(url).searchParams.get('xt')?.split(':').at(-1) ?? '';
    url = canonicalHash(hash);
  }
  return JSON.stringify([
    source,
    url,
    source === SOURCE_TYPE.video ? (request.quality ?? VIDEO_QUALITY.balanced) : null,
    source === SOURCE_TYPE.deviantart && request.deviantart ? validateDeviantartPreferences(request.deviantart) : null,
  ]);
}

/**
 * Normalizes both supported info-hash encodings so tracker variations do not create duplicate magnets.
 * @param {string} hash - Already validated hex or base32 v1 info hash.
 * @returns {string} Lowercase hexadecimal hash.
 */
function canonicalHash(hash: string): string {
  const hexadecimalLength = 40;
  if (hash.length === hexadecimalLength) {
    return hash.toLowerCase();
  }
  let accumulator = 0;
  let remainingBits = 0;
  const bytes: number[] = [];
  for (const character of hash.toUpperCase()) {
    accumulator = (accumulator << HASH_UNIT.bitsPerCharacter) | BASE32_ALPHABET.indexOf(character);
    remainingBits += HASH_UNIT.bitsPerCharacter;
    if (remainingBits >= HASH_UNIT.bitsPerByte) {
      remainingBits -= HASH_UNIT.bitsPerByte;
      bytes.push((accumulator >> remainingBits) & HASH_UNIT.byteMask);
      accumulator &= (1 << remainingBits) - 1;
    }
  }
  return Buffer.from(bytes).toString('hex');
}

/**
 * Validates every input before creating any record, then removes in-batch and existing-content duplicates.
 * @param {unknown} urls - One link per array entry.
 * @param {unknown} sourceType - Optional shared engine selection.
 * @param {unknown} quality - Optional shared video resolution.
 * @param {DownloadJob[]} history - Existing station records.
 * @param {() => DeviantartPreferences} [collectionPreferences] - Lazy station choices for new gallery requests.
 * @returns {object} Resolved unique requests and owner-visible skipped links.
 */
export function reviewBatch(
  urls: unknown,
  sourceType: unknown,
  quality: unknown,
  history: DownloadJob[],
  collectionPreferences: () => DeviantartPreferences = defaultDeviantartPreferences,
) {
  if (!Array.isArray(urls) || !urls.length || urls.length > MAXIMUM_BATCH_LINKS) {
    throw new Error(`Submit between 1 and ${MAXIMUM_BATCH_LINKS} links per batch.`);
  }
  let preferences: DeviantartPreferences | undefined;
  const requests = urls.map((url: unknown, index) => {
    try {
      const request: ResolvedRequest = resolveDownloadRequest(url, sourceType, quality);
      if (request.sourceType === SOURCE_TYPE.deviantart) {
        preferences ??= validateDeviantartPreferences(collectionPreferences());
        request.deviantart = validateDeviantartPreferences(preferences);
      }
      return request;
    } catch (error) {
      throw new Error(`Link ${index + 1}: ${error instanceof Error ? error.message : 'Invalid source.'}`);
    }
  });
  const known = new Set(
    history
      .filter((job) => job.status !== DOWNLOAD_STATUS.failed && job.status !== DOWNLOAD_STATUS.cancelled)
      .map(identity),
  );
  const unique: ResolvedRequest[] = [];
  const duplicates: string[] = [];
  for (const request of requests) {
    const key = identity(request);
    if (known.has(key)) {
      duplicates.push(request.url);
    } else {
      known.add(key);
      unique.push(request);
    }
  }
  if (history.length + unique.length > LIMIT.maximumHistory) {
    throw new Error('The history limit is reached. Remove older downloads before adding this batch.');
  }
  return { unique, duplicates };
}

/**
 * Creates a UUID-addressed record from a validated request without starting any network work.
 * @param {ResolvedRequest} request - Validated unique input.
 * @returns {DownloadJob} New queued record.
 */
export function createQueuedJob(request: ResolvedRequest): DownloadJob {
  return {
    id: randomUUID(),
    url: request.url,
    filename: request.filename,
    sourceType: request.sourceType,
    quality: request.quality,
    ...(request.deviantart ? { deviantart: validateDeviantartPreferences(request.deviantart) } : {}),
    priority: JOB_PRIORITY.normal,
    status: DOWNLOAD_STATUS.queued,
    receivedBytes: 0,
    totalBytes: null,
    bytesPerSecond: 0,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    errorMessage: null,
  };
}
