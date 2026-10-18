import type { SourceType, DownloadQuality } from '../../../../shared/sources';
import { useCallback, useEffect, useState } from 'react';
import { API_PATH, HTTP_METHOD, type DashboardSnapshot, type JobAction } from '../../../../shared/contracts';
import { POLL_INTERVAL_MILLISECONDS } from '../constants';
import type { BatchResult } from '../../../../shared/batch';
import type { LibraryMetadata } from '../../../../shared/library';
import type { BulkLibraryRequest, BulkLibraryResult } from '../../../../shared/bulkLibrary';
import { mutateLibrary } from '../services/bulkLibrary';
import {
  addDownload,
  addBatch,
  AuthenticationError,
  fetchDownloads,
  mutateDownload,
  organizeDownload,
  requestApi,
  uploadTorrent,
} from '../services/downloadApi';

/**
 * Owns polling, session expiry and serialized UI mutations; queue execution remains on the server.
 * @returns {object} Snapshot, connection state and authenticated mutation handlers.
 */
export function useDownloads() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  /**
   * Applies successful responses or exposes authentication and connectivity failures.
   * @param {AbortSignal} [signal] - Cancels requests when the owning view unmounts.
   * @returns {Promise<void>} Completes after the current refresh.
   */
  const refreshDownloads = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const nextSnapshot = await fetchDownloads(signal);
      setSnapshot(nextSnapshot);
      setErrorMessage('');
    } catch (error) {
      if (signal?.aborted) {
        return;
      }
      if (error instanceof AuthenticationError) {
        setIsLocked(true);
        setSnapshot(null);
      } else {
        setErrorMessage('Cannot reach your station. Reconnecting automatically…');
      }
    }
  }, []);

  useEffect(
    /**
     * Starts sequential polling and owns cancellation for this mounted session.
     * @returns {(() => void) | undefined} Cleanup when polling is installed.
     */
    () => {
      if (isLocked) {
        return;
      }
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout>;
      /** Avoids overlapping requests on a slow connection. @returns {Promise<void>} Next scheduled refresh. */
      async function pollDownloads(): Promise<void> {
        await refreshDownloads(controller.signal);
        if (!controller.signal.aborted) {
          timeout = setTimeout(pollDownloads, POLL_INTERVAL_MILLISECONDS);
        }
      }
      void pollDownloads();
      /** Cancels the outstanding refresh and removes its scheduled follow-up. */
      function cleanupDownloads(): void {
        controller.abort();
        clearTimeout(timeout);
      }
      return cleanupDownloads;
    },
    [isLocked, refreshDownloads],
  );

  /**
   * Authenticates without persisting the password in browser storage.
   * @param {string} token - Station password entered by the owner.
   * @returns {Promise<void>} Resolves when the session is established.
   */
  async function unlockStation(token: string): Promise<void> {
    await requestApi(API_PATH.session, { method: HTTP_METHOD.post, body: JSON.stringify({ token }) });
    setIsLocked(false);
  }

  /**
   * Adds a transfer and refreshes immediately; form errors remain available to its caller.
   * @param {string} url - Direct file link.
   * @param {SourceType} [sourceType] - Requested engine.
   * @param {DownloadQuality} [quality] - Maximum video resolution.
   * @returns {Promise<void>} Completes after acceptance and refresh.
   */
  async function queueDownload(url: string, sourceType?: SourceType, quality?: DownloadQuality): Promise<void> {
    try {
      await addDownload(url, sourceType, quality);
      await refreshDownloads();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        setIsLocked(true);
      }
      throw error;
    }
  }

  /**
   * Mutates a transfer and presents a conflict without losing current progress.
   * @param {string} jobId - Selected transfer.
   * @param {JobAction | 'delete'} action - Requested mutation.
   * @returns {Promise<void>} Completes after the refreshed state arrives.
   */
  async function handleJobAction(jobId: string, action: JobAction | 'delete'): Promise<void> {
    setBusyJobId(jobId);
    try {
      await mutateDownload(jobId, action);
      await refreshDownloads();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        setIsLocked(true);
      }
      setErrorMessage(error instanceof Error ? error.message : 'The action failed.');
    } finally {
      setBusyJobId(null);
    }
  }

  /** Locks this browser; background transfers continue. @returns {Promise<void>} Cleared session. */
  async function lockStation(): Promise<void> {
    try {
      await requestApi(API_PATH.session, { method: HTTP_METHOD.delete, body: '{}' });
      setIsLocked(true);
      setSnapshot(null);
    } catch {
      setErrorMessage('Unable to lock the station. Please try again.');
    }
  }
  /**
   * Uploads torrent metadata and refreshes the persisted queue.
   * @param {File} file - Selected torrent metadata.
   * @returns {Promise<void>} Queue acceptance and refresh.
   */
  async function queueTorrent(file: File): Promise<void> {
    try {
      await uploadTorrent(file);
      await refreshDownloads();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        setIsLocked(true);
      }
      throw error;
    }
  }
  /**
   * Adds an atomic reviewed batch and refreshes the queue immediately.
   * @param {string[]} urls - Reviewed links.
   * @param {SourceType} [sourceType] - Shared engine.
   * @param {DownloadQuality} [quality] - Shared resolution.
   * @returns {Promise<BatchResult>} Actual accepted records and skipped duplicates.
   */
  async function queueBatch(urls: string[], sourceType?: SourceType, quality?: DownloadQuality): Promise<BatchResult> {
    const result = await addBatch(urls, sourceType, quality);
    await refreshDownloads();
    return result;
  }
  /**
   * Saves labels and refreshes them immediately without hiding failures from the editor.
   * @param {string} jobId - Record being organized.
   * @param {LibraryMetadata} metadata - Canonical folder and tags.
   * @returns {Promise<void>} Persisted edit and refreshed collection.
   */
  async function organizeJob(jobId: string, metadata: LibraryMetadata): Promise<void> {
    try {
      await organizeDownload(jobId, metadata);
      await refreshDownloads();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        setIsLocked(true);
      }
      throw error;
    }
  }
  /**
   * Applies an explicit bulk selection and refreshes without concealing per-record failures.
   * @param {BulkLibraryRequest} request - Reviewed labels or deletion command.
   * @returns {Promise<BulkLibraryResult>} Persisted outcomes for the selection toolbar.
   */
  async function handleLibraryAction(request: BulkLibraryRequest): Promise<BulkLibraryResult> {
    try {
      const result = await mutateLibrary(request);
      await refreshDownloads();
      return result;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        setIsLocked(true);
      }
      throw error;
    }
  }
  return {
    handleLibraryAction,
    organizeJob,
    queueBatch,
    queueTorrent,
    snapshot,
    isLocked,
    errorMessage,
    busyJobId,
    unlockStation,
    queueDownload,
    handleJobAction,
    lockStation,
  };
}
