import path from 'node:path';
import { DELIVERY_LIMIT } from '../../../shared/media.js';
import { HTTP_STATUS } from '../../../shared/contracts.js';
import { FileDeliveryError } from './publishedFile.js';

/** Windows device names are made ordinary filenames so ZIP extraction stays portable. */
const DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

/**
 * Truncates on a Unicode code-point boundary rather than splitting a UTF-8 sequence.
 * @param {string} value - Canonical filename component.
 * @param {number} maximumBytes - Byte allowance.
 * @returns {string} Bounded complete characters.
 */
function truncateUtf8(value: string, maximumBytes: number): string {
  let result = '';
  for (const character of value) {
    if (Buffer.byteLength(result + character) > maximumBytes) {
      break;
    }
    result += character;
  }
  return result;
}

/**
 * Keeps readable filenames while removing device, control and cross-platform path syntax.
 * @param {string} value - One original filename or directory component.
 * @returns {string} Portable plain component, with bounded UTF-8 length.
 */
export function portableArchivePart(value: string): string {
  let name =
    value
      .normalize('NFC')
      .replace(/[<>:"|?*\p{Cc}]/gu, '_')
      .replace(/[ .]+$/u, '') || 'file';
  if (DEVICE_NAME.test(name)) {
    name = `_${name}`;
  }
  const extension = path.posix.extname(name);
  const boundedExtension = truncateUtf8(extension, DELIVERY_LIMIT.archiveExtensionBytes);
  const stem = extension ? name.slice(0, -extension.length) : name;
  return (
    truncateUtf8(stem, DELIVERY_LIMIT.archiveComponentBytes - Buffer.byteLength(boundedExtension)) + boundedExtension
  );
}

/** Case-insensitive allocation protects both filenames and parent directory names against normalized collisions. */
export class ArchiveNames {
  private readonly used = new Map<string, Set<string>>();
  private readonly directories = new Map<string, string>();

  /**
   * Preserves hierarchy while rejecting traversal and renaming ambiguous portable names deterministically.
   * @param {string} relativePath - Whitelisted published manifest path.
   * @returns {string} Unique relative ZIP entry path.
   */
  add(relativePath: string): string {
    const parts = relativePath.split(/[\\/]/);
    if (/^(?:[A-Za-z]:|[\\/])/.test(relativePath) || parts.some((part) => !part || part === '.' || part === '..')) {
      throw new FileDeliveryError(
        HTTP_STATUS.badRequest,
        'A filename cannot be archived safely. Save files individually.',
      );
    }
    let original = '';
    let parent = '';
    for (const [index, part] of parts.entries()) {
      original = original ? `${original}/${part}` : part;
      const isDirectory = index < parts.length - 1;
      const existing = isDirectory ? this.directories.get(original) : undefined;
      if (existing) {
        parent = existing;
        continue;
      }
      const name = this.allocate(parent, portableArchivePart(part));
      parent = parent ? `${parent}/${name}` : name;
      if (isDirectory) {
        this.directories.set(original, parent);
      }
    }
    if (Buffer.byteLength(parent) > DELIVERY_LIMIT.maximumArchiveNameBytes) {
      throw new FileDeliveryError(HTTP_STATUS.badRequest, 'An archive filename is too long. Save files individually.');
    }
    return parent;
  }

  /**
   * Allocates one child across files and directories in the same output parent.
   * @param {string} parent - Already allocated output directory.
   * @param {string} candidate - Sanitized component.
   * @returns {string} Unique child label.
   */
  private allocate(parent: string, candidate: string): string {
    const siblings = this.used.get(parent) ?? new Set<string>();
    const extension = path.posix.extname(candidate);
    const stem = extension ? candidate.slice(0, -extension.length) : candidate;
    let name = candidate;
    let duplicate = 1;
    while (siblings.has(name.toLowerCase())) {
      duplicate += 1;
      name = `${stem} (${duplicate})${extension}`;
    }
    siblings.add(name.toLowerCase());
    this.used.set(parent, siblings);
    return name;
  }
}

/**
 * Produces a plain attachment name without exposing the storage UUID as the visible filename.
 * @param {string} displayName - Job display filename.
 * @returns {string} Portable ZIP download name.
 */
export function archiveDownloadName(displayName: string): string {
  const basename = portableArchivePart(displayName.split(/[\\/]/).at(-1) ?? 'LinkDock');
  return `${path.posix.parse(basename).name || 'LinkDock'}.zip`;
}
