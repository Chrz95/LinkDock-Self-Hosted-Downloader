import { linkSync, lstatSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { DownloadArtifact } from '../../../shared/sources.js';
import { safeDirectory } from './paths.js';
import { writeJournal, type MoveJournal } from './journal.js';

export const COMPLETION_STAGING_PREFIX = '.linkdock-';
const MAXIMUM_SUFFIX = 9_999;
const FIRST_SUFFIX = 2;
const MAXIMUM_LEAF_BYTES = 255;

/** Returns a path only for an ordinary relative manifest entry within its root.
 * @param {string} root - Validated shared or staging folder.
 * @param {string} relative - Portable manifest path.
 * @returns {string} Contained path, before ancestor checks.
 */
export function publicationPath(root: string, relative: string): string {
  const parts = relative.split(path.sep).join('/').split('/');
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /[\\:\p{Cc}]/u.test(part) ||
        part.startsWith(COMPLETION_STAGING_PREFIX) ||
        Buffer.byteLength(part) > MAXIMUM_LEAF_BYTES,
    )
  ) {
    throw new Error('Unsafe completion manifest.');
  }
  return path.join(root, ...parts);
}

/** Reads file identity without following a symbolic link.
 * @param {string} filename - Candidate path with checked ancestors.
 * @returns {import('node:fs').BigIntStats | undefined} Information for an existing filesystem entry.
 */
export function publicationStat(filename: string) {
  return lstatSync(filename, { bigint: true, throwIfNoEntry: false });
}

/** Matches a recorded file after restart without treating a replacement at its path as owned.
 * @param {import('node:fs').BigIntStats | undefined} info - Current file identity.
 * @param {DownloadArtifact} file - Published manifest entry.
 * @returns {boolean} Whether the current file is the recorded publication.
 */
export function ownsPublication(info: ReturnType<typeof publicationStat>, file: DownloadArtifact): boolean {
  return Boolean(
    info?.isFile() &&
    file.publication &&
    info.size === BigInt(file.sizeBytes) &&
    String(info.ino) === file.publication.inode &&
    String(info.mtimeNs) === file.publication.modified,
  );
}

/** Finds a free sibling name and keeps the extension for ordinary names.
 * @param {string} parent - Checked output folder.
 * @param {string} original - Preferred relative output name.
 * @returns {string} Available relative path.
 */
function availablePath(parent: string, original: string): string {
  const { dir, name, ext } = path.posix.parse(original);
  let candidate = original;
  for (let suffix = FIRST_SUFFIX; publicationStat(publicationPath(parent, candidate)); suffix += 1) {
    if (suffix > MAXIMUM_SUFFIX) {
      throw new Error('No available filename in the completion folder.');
    }
    const marker = ` (${suffix})`;
    const extension = Buffer.byteLength(ext) + Buffer.byteLength(marker) < MAXIMUM_LEAF_BYTES ? ext : '';
    const characters = [...name];
    while (Buffer.byteLength(`${characters.join('')}${marker}${extension}`) > MAXIMUM_LEAF_BYTES) {
      characters.pop();
    }
    candidate = path.posix.join(dir, `${characters.join('')}${marker}${extension}`);
  }
  return candidate;
}

/** Publishes already flushed bytes with exclusive filenames, recording each path before creating its link.
 * @param {string} directory - Hidden job staging and journal folder on the destination filesystem.
 * @param {string} incoming - Private, fully prepared artifact root.
 * @param {string} parent - Shared output folder.
 * @param {MoveJournal} journal - Prepared source manifest and any interrupted publications.
 * @returns {DownloadArtifact[]} Final manifest in original file order.
 */
export function publishFiles(
  directory: string,
  incoming: string,
  parent: string,
  journal: MoveJournal,
): DownloadArtifact[] {
  const published = journal.published ?? [];
  journal.published = published;
  for (const [index, file] of journal.files.entries()) {
    const relative = file.relativePath.split(path.sep).join('/');
    const source = publicationPath(incoming, relative);
    safeDirectory(path.dirname(source));
    const info = publicationStat(source);
    if (!info?.isFile()) {
      throw new Error('Prepared completion file is unavailable.');
    }
    const previous = published[index];
    if (previous) {
      const target = publicationPath(parent, previous.relativePath);
      safeDirectory(path.dirname(target));
      const existing = publicationStat(target);
      if (ownsPublication(existing, previous) && existing?.dev === info.dev && existing.ino === info.ino) {
        continue;
      }
    }
    safeDirectory(path.dirname(publicationPath(parent, relative)), true);
    for (;;) {
      const relativePath = availablePath(parent, relative);
      published[index] = {
        ...file,
        relativePath: relativePath.split('/').join(path.sep),
        name: relativePath,
        publication: { inode: String(info.ino), modified: String(info.mtimeNs) },
      };
      writeJournal(directory, journal);
      try {
        linkSync(source, publicationPath(parent, relativePath));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }
    }
  }
  return published;
}

/** Deletes only published files whose recorded identity still matches, leaving sibling files and folders alone.
 * @param {string} parent - Shared destination folder.
 * @param {DownloadArtifact[]} files - Completed or partially published manifest.
 */
export function removePublications(parent: string, files: DownloadArtifact[]): void {
  for (const file of files) {
    const filename = publicationPath(parent, file.relativePath);
    try {
      safeDirectory(path.dirname(filename));
      if (ownsPublication(publicationStat(filename), file)) {
        rmSync(filename, { force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
