import type { SourceType, DownloadQuality } from '../../../../shared/sources';
import type { BatchPreview, BatchResult } from '../../../../shared/batch';
import {
  API_PATH,
  DOWNLOAD_PATH,
  HTTP_METHOD,
  type DashboardSnapshot,
  type JobAction,
} from '../../../../shared/contracts';

import { requestApi } from '../../../lib/api/requestApi';
import type { LibraryMetadata } from '../../../../shared/library';
export { requestApi, AuthenticationError } from '../../../lib/api/requestApi';

/**
 * Replaces only a transfer's logical organization through the protected JSON API.
 * @param {string} jobId - Server-owned transfer ID.
 * @param {LibraryMetadata} metadata - Reviewed folder and tags.
 * @returns {Promise<void>} Organization persisted.
 */
export function organizeDownload(jobId: string, metadata: LibraryMetadata): Promise<void> {
  return requestApi(`${API_PATH.downloads}/${jobId}${DOWNLOAD_PATH.organization}`, {
    method: HTTP_METHOD.post,
    body: JSON.stringify(metadata),
  });
}

/**
 * Reviews or atomically queues a bounded batch through the existing authenticated API.
 * @param {string[]} urls - One link per entry.
 * @param {SourceType} sourceType - Shared engine selection.
 * @param {DownloadQuality} quality - Shared resolution policy.
 * @returns {Promise<BatchPreview>} Validated review without starting work.
 */
export function previewBatch(urls: string[], sourceType: SourceType, quality: DownloadQuality): Promise<BatchPreview> {
  return requestApi(`${API_PATH.downloads}${DOWNLOAD_PATH.batchPreview}`, {
    method: HTTP_METHOD.post,
    body: JSON.stringify({ urls, sourceType, quality }),
  });
}

/**
 * Commits all valid unique links together and reports skips that changed since review.
 * @param {string[]} urls - Reviewed links.
 * @param {SourceType} [sourceType] - Shared engine selection.
 * @param {DownloadQuality} [quality] - Shared resolution policy.
 * @returns {Promise<BatchResult>} Accepted records and duplicate feedback.
 */
export function addBatch(urls: string[], sourceType?: SourceType, quality?: DownloadQuality): Promise<BatchResult> {
  return requestApi(`${API_PATH.downloads}${DOWNLOAD_PATH.batch}`, {
    method: HTTP_METHOD.post,
    body: JSON.stringify({ urls, sourceType, quality }),
  });
}

/**
 * Retrieves live transfer progress without storing a second server-side cache.
 * @param {AbortSignal} [signal] - Optional cancellation when a view unmounts.
 * @returns {Promise<DashboardSnapshot>} Current queue snapshot.
 */
export function fetchDownloads(signal?: AbortSignal): Promise<DashboardSnapshot> {
  return requestApi(API_PATH.downloads, { signal });
}

/**
 * Queues a single direct file URL.
 * @param {string} url - Submitted HTTP/HTTPS link.
 * @param {SourceType} [sourceType] - Explicit engine or automatic detection.
 * @param {DownloadQuality} [quality] - Site-video resolution policy.
 * @returns {Promise<void>} Resolves after the server accepts it.
 */
export async function addDownload(url: string, sourceType?: SourceType, quality?: DownloadQuality): Promise<void> {
  await requestApi(API_PATH.downloads, {
    method: HTTP_METHOD.post,
    body: JSON.stringify({ url, sourceType, quality }),
  });
}

/**
 * Sends a state transition or deletes a terminal record and file.
 * @param {string} jobId - Existing transfer identifier.
 * @param {JobAction | 'delete'} action - Requested operation.
 * @returns {Promise<void>} Resolves after the mutation is persisted.
 */
export async function mutateDownload(jobId: string, action: JobAction | 'delete'): Promise<void> {
  const endpoint = `${API_PATH.downloads}/${jobId}${action === 'delete' ? '' : `/${action}`}`;
  await requestApi(endpoint, { method: action === 'delete' ? HTTP_METHOD.delete : HTTP_METHOD.post, body: '{}' });
}

/**
 * Sends a browser-selected torrent as bounded metadata instead of a raw server-side path.
 * @param {File} file - User-selected .torrent file.
 * @returns {Promise<void>} Queue acceptance.
 */
export async function uploadTorrent(file: File): Promise<void> {
  const torrentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').at(-1) ?? '');
    reader.onerror = () => reject(new Error('This torrent file could not be read.'));
    reader.readAsDataURL(file);
  });
  await requestApi(`${API_PATH.downloads}${DOWNLOAD_PATH.torrentUpload}`, {
    method: HTTP_METHOD.post,
    body: JSON.stringify({ torrentBase64, filename: file.name }),
  });
}
