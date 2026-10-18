import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DownloadJob } from '../../../shared/contracts.js';
import { openSource } from '../../downloads/openSource.js';
import { parseTargetUrl } from '../../security/target.js';
import { ENGINE_LIMIT, OUTPUT } from '../constants.js';
import { SOURCE_URL } from '../../../shared/sources.js';
import { saveUploadedTorrent } from '../../downloads/uploadTorrent.js';

/**
 * Reads uploaded metadata or a checked public torrent URL, never delegating arbitrary HTTP fetches to aria2.
 * @param {DownloadJob} job - Uploaded or remote torrent request.
 * @param {string} dataDirectory - Persistent metadata root.
 * @param {AbortSignal} signal - Queue cancellation.
 * @returns {Promise<string>} Bounded torrent metadata in aria2's required base64 representation.
 */
export async function readTorrentMetadata(
  job: DownloadJob,
  dataDirectory: string,
  signal: AbortSignal,
): Promise<string> {
  const metadataPath = path.join(dataDirectory, OUTPUT.metadataDirectory, `${job.id}.torrent`);
  if (job.url === `${SOURCE_URL.uploadedTorrent}${job.id}` || existsSync(metadataPath)) {
    const contents = await readFile(metadataPath);
    return contents.toString('base64');
  }
  const response = await openSource(parseTargetUrl(job.url), signal);
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  try {
    for await (const chunk of response) {
      const buffer = Buffer.from(chunk as Uint8Array);
      receivedBytes += buffer.length;
      if (receivedBytes > ENGINE_LIMIT.maximumTorrentBytes) {
        throw new Error('Torrent metadata exceeds 2 MiB.');
      }
      chunks.push(buffer);
    }
    signal.throwIfAborted();
    const encodedMetadata = Buffer.concat(chunks).toString('base64');
    saveUploadedTorrent(encodedMetadata, job.filename, job.id, dataDirectory);
    return encodedMetadata;
  } finally {
    response.destroy();
  }
}
