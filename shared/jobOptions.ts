/** Torrent indexes are engine-owned, one-based and stable within the pinned metadata. */
export interface TorrentFile {
  index: number;
  name: string;
  sizeBytes: number;
}
export interface TorrentSelection {
  files?: TorrentFile[];
  selected?: number[];
}
/** A relative destination is resolved only beneath the administrator's configured completion root. */
export interface CompletionDestination {
  directory: string;
  moved: boolean;
  error: string | null;
}
export const JOB_OPTIONS = {
  torrent: '/torrent-selection',
  destination: '/destination',
  retryMove: '/retry-move',
  maximumFiles: 2_000,
  maximumPathCharacters: 1_024,
  maximumDirectoryCharacters: 240,
  maximumDirectorySegmentBytes: 240,
  rootDirectory: '.',
} as const;

/**
 * Accepts the completion root marker or nested folders, rejecting absolute, hidden and traversal paths.
 * @param {unknown} input - Submitted relative completion folder.
 * @returns {string} Canonical slash-separated folder.
 */
export function validateDestination(input: unknown): string {
  const directory = typeof input === 'string' ? input.normalize('NFC') : input;
  if (directory === JOB_OPTIONS.rootDirectory) {
    return directory;
  }
  if (
    typeof directory !== 'string' ||
    !directory ||
    directory.length > JOB_OPTIONS.maximumDirectoryCharacters ||
    /[\p{Cc}\\:]/u.test(directory) ||
    directory
      .split('/')
      .some(
        (part) =>
          !part ||
          part.startsWith('.') ||
          part.trim() !== part ||
          new TextEncoder().encode(part).length > JOB_OPTIONS.maximumDirectorySegmentBytes,
      )
  ) {
    throw new Error('Use . for the completion root, or a relative folder such as Movies without traversal paths.');
  }
  return directory;
}
/**
 * Validates persisted or discovered torrent entries without trusting path traversal or duplicate indexes.
 * @param {unknown} input - Engine-derived or saved file list.
 * @returns {TorrentFile[]} Isolated bounded manifest.
 */
export function validateTorrentFiles(input: unknown): TorrentFile[] {
  if (!Array.isArray(input) || !input.length || input.length > JOB_OPTIONS.maximumFiles) {
    throw new Error('Torrent file metadata is unavailable or contains too many files.');
  }
  const indexes = new Set<number>();
  const names = new Set<string>();
  return input.map((item: unknown) => {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid torrent file.');
    }
    const { index, name, sizeBytes } = item as Record<string, unknown>;
    if (
      typeof index !== 'number' ||
      !Number.isSafeInteger(index) ||
      index < 1 ||
      indexes.has(index) ||
      typeof name !== 'string' ||
      !name ||
      name.length > JOB_OPTIONS.maximumPathCharacters ||
      names.has(name) ||
      /[\p{Cc}\\]/u.test(name) ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      typeof sizeBytes !== 'number' ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 0
    ) {
      throw new Error('Invalid torrent file metadata.');
    }
    indexes.add(index);
    names.add(name);
    return { index, name, sizeBytes };
  });
}
/**
 * Validates explicit selection, preserving no implicit download-all fallback for an empty choice.
 * @param {unknown} input - Submitted one-based indexes.
 * @param {TorrentFile[]} files - Current pinned manifest.
 * @returns {number[]} Sorted unique selected indexes.
 */
export function validateTorrentSelection(input: unknown, files: TorrentFile[]): number[] {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > files.length ||
    input.some(
      (value) =>
        typeof value !== 'number' || !Number.isSafeInteger(value) || !files.some((file) => file.index === value),
    ) ||
    new Set(input).size !== input.length
  ) {
    throw new Error('Choose at least one existing torrent file, without duplicate indexes.');
  }
  return [...input].sort((first: number, second: number) => first - second);
}
