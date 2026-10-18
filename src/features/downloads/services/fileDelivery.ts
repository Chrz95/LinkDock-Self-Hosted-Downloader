import { API_PATH, DOWNLOAD_PATH, HTTP_METHOD, HTTP_STATUS } from '../../../../shared/contracts';

/** Delivery failures are readable without consuming or buffering a native file download. */
const DELIVERY_ERROR = {
  [HTTP_STATUS.unauthorized]: 'Unlock your station again before opening this file.',
  [HTTP_STATUS.notFound]: 'This saved file is unavailable. Check station storage or restore your backup.',
  [HTTP_STATUS.conflict]: 'The download is not ready or a saved file has changed. Refresh the collection.',
  [HTTP_STATUS.tooLarge]: 'This image is too large for a preview. Save the original file instead.',
  [HTTP_STATUS.unsupportedMediaType]: 'This file cannot be previewed here. Save it to your device instead.',
  [HTTP_STATUS.tooManyRequests]: 'Two ZIP downloads are already running. Wait or cancel one in your browser.',
} as const;

/**
 * Constructs only same-origin, ID/index-addressed file links.
 * @param {string} jobId - Server-owned UUID.
 * @param {boolean} isPreview - Whether to request recognized inline media.
 * @param {number} [fileIndex] - Optional published manifest entry.
 * @returns {string} Authenticated delivery endpoint.
 */
export function fileDeliveryUrl(jobId: string, isPreview: boolean, fileIndex?: number): string {
  const suffix = isPreview ? DOWNLOAD_PATH.preview : fileIndex === undefined ? DOWNLOAD_PATH.file : DOWNLOAD_PATH.files;
  return `${API_PATH.downloads}/${jobId}${suffix}${fileIndex === undefined ? '' : `/${fileIndex}`}`;
}

/**
 * Checks authentication and server validation before mounting media or requesting an attachment.
 * @param {string} url - Same-origin application-built delivery endpoint.
 * @param {AbortSignal} signal - View lifecycle or cancelled click.
 * @returns {Promise<void>} Headers validated without loading the file body.
 */
export async function probeDelivery(url: string, signal: AbortSignal): Promise<void> {
  const response = await fetch(url, {
    method: HTTP_METHOD.head,
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    const known = DELIVERY_ERROR[response.status as keyof typeof DELIVERY_ERROR];
    throw new Error(known ?? 'The station could not prepare this file. Try again when it is reachable.');
  }
}

/**
 * Hands a checked attachment URL to the browser without storing its contents in a JavaScript Blob.
 * @param {string} url - Application-built attachment endpoint.
 */
export function beginNativeDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '';
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
