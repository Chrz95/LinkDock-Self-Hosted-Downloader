import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { DownloadJob } from '../../../shared/contracts.js';
import { validateDestination } from '../../../shared/jobOptions.js';

/**
 * Walks every directory component, rejecting symlinks and non-directories before reading or creating output.
 * @param {string} directory - Absolute managed directory.
 * @param {boolean} [create] - Whether missing directories may be created.
 * @returns {string} Canonical validated directory.
 */
export function safeDirectory(directory: string, create = false): string {
  const absolute = path.resolve(directory);
  const { root } = path.parse(absolute);
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (create) {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }
    }
    const information = lstatSync(current);
    if (!information.isDirectory() || information.isSymbolicLink()) {
      throw new Error('Unsafe completion directory.');
    }
  }
  return realpathSync(absolute);
}
/**
 * Resolves a job-specific managed destination below the configured mount.
 * @param {string} root - Administrator-controlled storage root.
 * @param {DownloadJob} job - Validated history record with a destination.
 * @param {boolean} [createParents] - Whether its owner-chosen parent folder can be created.
 * @returns {string} Absolute job directory, whose leaf may not yet exist.
 */
export function destinationDirectory(root: string, job: DownloadJob, createParents = false): string {
  return path.join(destinationParent(root, job, createParents), job.id);
}

/** Resolves the selected shared folder beneath the configured root.
 * @param {string} root - Administrator-controlled storage root.
 * @param {DownloadJob} job - Job with a validated destination.
 * @param {boolean} [createParents] - Whether missing folders can be created.
 * @returns {string} Absolute checked output folder.
 */
export function destinationParent(root: string, job: DownloadJob, createParents = false): string {
  if (!job.destination) {
    throw new Error('No completion destination.');
  }
  const base = safeDirectory(root, createParents);
  return safeDirectory(path.join(base, validateDestination(job.destination.directory)), createParents);
}
