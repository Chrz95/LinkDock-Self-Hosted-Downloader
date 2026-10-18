/** Formats eligible for an explicit original-file preview; the server independently checks file headers. */
export const PREVIEW_FORMATS = {
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  png: { kind: 'image', mime: 'image/png' },
  gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
} as const;
/** Raster images and native video have no embedded application document behavior. */
export type PreviewFormat = (typeof PREVIEW_FORMATS)[keyof typeof PREVIEW_FORMATS];
/** Byte and resource ceilings keep original-file previews and exports practical on a Pi. */
export const DELIVERY_LIMIT = {
  maximumImageBytes: 26_214_400,
  headerBytes: 4_096,
  streamBufferBytes: 65_536,
  maximumArchives: 2,
  idleMilliseconds: 30_000,
  retrySeconds: 30,
  maximumArchiveNameBytes: 65_535,
  archiveComponentBytes: 200,
  archiveExtensionBytes: 32,
} as const;

/**
 * Finds a conservative UI candidate without trusting an extension as server-side validation.
 * @param {string} filename - Saved display name.
 * @returns {PreviewFormat | null} Eligible raster/video format or an ordinary download-only file.
 */
export function getPreviewFormat(filename: string): PreviewFormat | null {
  const extension = filename.split('.').at(-1)?.toLowerCase() ?? '';
  return Object.hasOwn(PREVIEW_FORMATS, extension) ? PREVIEW_FORMATS[extension as keyof typeof PREVIEW_FORMATS] : null;
}
