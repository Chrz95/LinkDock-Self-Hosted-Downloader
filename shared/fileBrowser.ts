/** Bounded collection rendering keeps large galleries usable on mobile devices. */
export const COLLECTION_PAGE_SIZE = 25;
export const FILE_KIND = {
  all: 'all',
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'document',
  other: 'other',
} as const;
export type FileKind = (typeof FILE_KIND)[keyof typeof FILE_KIND];
export const FILE_KINDS = [
  { value: FILE_KIND.all, label: 'All files' },
  { value: FILE_KIND.image, label: 'Images' },
  { value: FILE_KIND.video, label: 'Videos' },
  { value: FILE_KIND.audio, label: 'Audio' },
  { value: FILE_KIND.document, label: 'Documents & stories' },
  { value: FILE_KIND.other, label: 'Other files' },
] as const;
export const FILE_SORT = {
  name: 'name',
  reverseName: 'reverse-name',
  largest: 'largest',
  smallest: 'smallest',
} as const;
export type FileSort = (typeof FILE_SORT)[keyof typeof FILE_SORT];
export const FILE_SORTS = [
  { value: FILE_SORT.name, label: 'Name · A–Z' },
  { value: FILE_SORT.reverseName, label: 'Name · Z–A' },
  { value: FILE_SORT.largest, label: 'Largest first' },
  { value: FILE_SORT.smallest, label: 'Smallest first' },
] as const;
const EXTENSIONS = {
  image: new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff', 'heic', 'svg']),
  video: new Set(['mp4', 'webm', 'mkv', 'mov', 'm4v', 'avi', 'ts', 'mpeg', 'mpg', 'flv']),
  audio: new Set(['mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wav', 'wma', 'aiff']),
  document: new Set(['txt', 'md', 'pdf', 'html', 'htm', 'epub', 'rtf', 'doc', 'docx', 'odt', 'srt', 'vtt']),
};
/**
 * Classifies display names for filtering only; delivery still validates eligibility and actual bytes separately.
 * @param {string} filename - Server-created manifest name.
 * @returns {FileKind} Extension family or other; never a preview authorization.
 */
export function fileKind(filename: string): FileKind {
  const leaf = filename.split(/[\\/]/u).at(-1) ?? '';
  const extension = leaf.includes('.') ? (leaf.split('.').at(-1)?.toLowerCase() ?? '') : '';
  for (const [kind, extensions] of Object.entries(EXTENSIONS)) {
    if (extensions.has(extension)) {
      return kind as FileKind;
    }
  }
  return FILE_KIND.other;
}
