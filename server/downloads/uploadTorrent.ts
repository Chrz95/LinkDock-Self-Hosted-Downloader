import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { ENGINE_LIMIT, OUTPUT } from '../engines/constants.js';
import { LIMIT } from '../constants.js';

/**
 * Validates a bounded browser-uploaded .torrent payload and persists it by generated UUID.
 * @param {unknown} encodedMetadata - Base64-encoded torrent bytes.
 * @param {unknown} displayName - Browser-provided name, never used as a filesystem path.
 * @param {string} jobId - Server-generated storage ID.
 * @param {string} dataDirectory - Persistent state root.
 * @returns {string} Bounded display name for the queue.
 */
export function saveUploadedTorrent(
  encodedMetadata: unknown,
  displayName: unknown,
  jobId: string,
  dataDirectory: string,
): string {
  if (typeof encodedMetadata !== 'string' || !/^[A-Za-z\d+/]+={0,2}$/.test(encodedMetadata)) {
    throw new Error('Select a valid .torrent file.');
  }
  const bytes = Buffer.from(encodedMetadata, 'base64');
  if (
    !bytes.length ||
    bytes.length > ENGINE_LIMIT.maximumTorrentBytes ||
    bytes[0] !== 'd'.charCodeAt(0) ||
    bytes.at(-1) !== 'e'.charCodeAt(0)
  ) {
    throw new Error('Use a .torrent metadata file no larger than 2 MiB.');
  }
  const directory = path.join(dataDirectory, OUTPUT.metadataDirectory);
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, `${jobId}.torrent`);
  writeFileSync(`${filename}.tmp`, bytes, { mode: 0o600 });
  renameSync(`${filename}.tmp`, filename);
  return typeof displayName === 'string'
    ? path.basename(displayName).slice(0, LIMIT.maximumFilenameLength)
    : 'Uploaded torrent';
}
