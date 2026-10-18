import { readdir, realpath, stat, lstat } from 'node:fs/promises';
import path from 'node:path';
import type { DownloadArtifact } from '../../shared/sources.js';
import { ENGINE_LIMIT } from './constants.js';

/** Paused fragment and merge leftovers stay private even when a later engine invocation succeeds. */
const MEDIA_TEMPORARY_FILE = /(?:\.(?:part(?:-Frag\d+)?|ytdl|tmp)$|\.temp\.[^.]+$|\]\.f[^.]+\.[^.]+$)/;

/**
 * Walks only regular output files, excluding symlinks and engine bookkeeping.
 * @param {string} directory - Worker output root.
 * @param {string} [relativeDirectory] - Internal traversal location.
 * @param {boolean} [shouldIgnoreMediaTemporaryFiles] - Whether media partials should be omitted.
 * @returns {Promise<DownloadArtifact[]>} Stable file manifest relative to the isolated root.
 */
export async function listArtifacts(
  directory: string,
  relativeDirectory = '',
  shouldIgnoreMediaTemporaryFiles = true,
): Promise<DownloadArtifact[]> {
  if (relativeDirectory.split(path.sep).length > ENGINE_LIMIT.maximumDirectoryDepth) {
    throw new Error('Downloaded directory nesting exceeds the supported limit.');
  }
  const artifacts: DownloadArtifact[] = [];
  for (const entry of await readdir(path.join(directory, relativeDirectory), { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('Symbolic links are not allowed in downloaded output.');
    }
    if (entry.isDirectory()) {
      artifacts.push(...(await listArtifacts(directory, relativePath, shouldIgnoreMediaTemporaryFiles)));
    } else if (
      entry.isFile() &&
      !entry.name.endsWith('.aria2') &&
      (!shouldIgnoreMediaTemporaryFiles || !MEDIA_TEMPORARY_FILE.test(entry.name))
    ) {
      const information = await stat(path.join(directory, relativePath));
      artifacts.push({ name: relativePath, relativePath, sizeBytes: information.size });
    }
    if (artifacts.length > ENGINE_LIMIT.maximumFiles) {
      throw new Error('This download contains too many files.');
    }
  }
  return artifacts.sort((first, second) => first.relativePath.localeCompare(second.relativePath));
}

/**
 * Resolves a manifest entry and checks its real location again before serving it.
 * @param {string} directory - Published job directory.
 * @param {string} relativePath - Server-created manifest path.
 * @returns {Promise<string>} Contained absolute regular-file path.
 */
export async function resolveArtifactPath(directory: string, relativePath: string): Promise<string> {
  const parts = relativePath.split(path.sep);
  if (path.isAbsolute(relativePath) || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('The requested file is outside this download.');
  }
  let checkedPath = directory;
  for (const part of ['', ...parts]) {
    checkedPath = part ? path.join(checkedPath, part) : checkedPath;
    if ((await lstat(checkedPath)).isSymbolicLink()) {
      throw new Error('The requested file is outside this download.');
    }
  }
  const root = await realpath(directory);
  const resolvedPath = await realpath(path.resolve(root, relativePath));
  if (!resolvedPath.startsWith(`${root}${path.sep}`) || !(await stat(resolvedPath)).isFile()) {
    throw new Error('The requested file is outside this download.');
  }
  return resolvedPath;
}
