import { constants, type Stats } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { DOWNLOAD_STATUS, HTTP_STATUS, type DownloadJob } from '../../../shared/contracts.js';
import { OUTPUT } from '../../engines/constants.js';
import { resolveArtifactPath } from '../../engines/artifacts.js';
import type { DownloadQueue } from '../queue.js';

/** Safe delivery errors contain no filesystem paths or engine diagnostic text. */
export class FileDeliveryError extends Error {
  /**
   * Carries a deliberate HTTP response for an owner-facing delivery failure.
   * @param {number} status - HTTP result.
   * @param {string} message - Safe recovery guidance.
   */
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
/** An opened regular file is served from this descriptor instead of reopening a pathname after validation. */
export interface PublishedFile {
  handle: FileHandle;
  information: Stats;
  displayName: string;
}

/**
 * Opens only an immutable completed file selected by job ID and canonical manifest index.
 * @param {DownloadQueue} queue - Owner queue and server-controlled storage paths.
 * @param {DownloadJob} job - Existing job.
 * @param {string} [fileIndex] - Canonical manifest index; omitted selects the default artifact.
 * @returns {Promise<PublishedFile>} Open descriptor, real size and display name.
 */
export async function openPublishedFile(
  queue: DownloadQueue,
  job: DownloadJob,
  fileIndex?: string,
): Promise<PublishedFile> {
  if (job.status !== DOWNLOAD_STATUS.completed) {
    throw new FileDeliveryError(HTTP_STATUS.conflict, 'This download is not ready.');
  }
  let filename = queue.store.getFilePath(job.id);
  let displayName = job.filename;
  const index = fileIndex === undefined ? 0 : /^(?:0|[1-9]\d*)$/.test(fileIndex) ? Number(fileIndex) : -1;
  const artifact = Number.isSafeInteger(index) && index >= 0 ? job.files?.[index] : undefined;
  if ((job.files?.length && !artifact) || (!job.files?.length && fileIndex !== undefined)) {
    throw new FileDeliveryError(HTTP_STATUS.notFound, 'File not found.');
  }
  let handle: FileHandle | undefined;
  try {
    if (artifact) {
      filename = await resolveArtifactPath(`${filename}${OUTPUT.outputSuffix}`, artifact.relativePath);
      displayName = artifact.name.split(/[\\/]/).at(-1) ?? artifact.name;
    }
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    const information = await handle.stat();
    if (!information.isFile() || !Number.isSafeInteger(information.size) || information.size < 0) {
      throw new Error('Not a regular file.');
    }
    if (artifact && information.size !== artifact.sizeBytes) {
      throw new FileDeliveryError(HTTP_STATUS.conflict, 'This saved file has changed. Restore it from your backup.');
    }
    return { handle, information, displayName };
  } catch (error) {
    await handle?.close();
    if (error instanceof FileDeliveryError) {
      throw error;
    }
    throw new FileDeliveryError(
      HTTP_STATUS.notFound,
      'This saved file is unavailable. Check storage or restore a backup.',
    );
  }
}
