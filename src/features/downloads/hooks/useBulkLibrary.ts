import { useRef, useState } from 'react';
import type { DownloadJob } from '../../../../shared/contracts';
import {
  BULK_ACTION,
  BULK_LIBRARY,
  isBulkDeletable,
  type BulkLibraryRequest,
  type BulkOrganization,
  type MutateLibrary,
} from '../../../../shared/bulkLibrary';

/**
 * Keeps explicit selection independent of polling and freezes the filenames reviewed before deletion.
 * @param {DownloadJob[]} jobs - Currently visible records.
 * @param {MutateLibrary} [onMutate] - Owner-authenticated command and refresh.
 * @returns {object} Selection, review state and bounded commands.
 */
export function useBulkLibrary(jobs: DownloadJob[], onMutate?: MutateLibrary) {
  const [ids, setIds] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<DownloadJob[] | null>(null);
  const pending = useRef(false);
  const selectedJobs = jobs.filter((job) => ids.includes(job.id));
  const retainedIds = ids.filter((id) => jobs.some((job) => job.id === id));
  // Adjust selection before committing this render when polling removes a selected row from the current view.
  if (!isBusy && retainedIds.length !== ids.length) {
    setIds(retainedIds);
    setReview(null);
  }
  /** Clears selection and any destructive review without changing saved data. */
  function clear(): void {
    setIds([]);
    setReview(null);
    setError('');
    setMessage('');
  }
  /**
   * Selects one visible record; a changed selection always invalidates deletion review.
   * @param {string} id - Existing transfer ID.
   */
  function toggle(id: string): void {
    if (pending.current) {
      return;
    }
    setIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length < BULK_LIBRARY.maximum
          ? [...current, id]
          : current,
    );
    setReview(null);
    setMessage('');
    setError('');
  }
  /**
   * Takes a snapshot of currently visible IDs; polling never automatically selects later arrivals.
   * @param {DownloadJob[]} visible - Filtered records at the instant the owner clicks.
   */
  function selectVisible(visible: DownloadJob[]): void {
    if (pending.current) {
      return;
    }
    clear();
    setIds(visible.slice(0, BULK_LIBRARY.maximum).map((job) => job.id));
  }
  /**
   * Executes once and retains failed deletion IDs for an explicit retry rather than silently dropping them.
   * @param {BulkLibraryRequest} request - Fixed membership and operation.
   * @returns {Promise<void>} Outcomes are presented in the toolbar.
   */
  async function run(request: BulkLibraryRequest): Promise<void> {
    if (pending.current || !onMutate) {
      return;
    }
    pending.current = true;
    setIsBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await onMutate(request);
      setReview(null);
      if (request.action === BULK_ACTION.delete) {
        setIds(result.failures.map((failure) => failure.id));
        setMessage(`${result.deletedIds.length} downloads deleted.`);
      } else {
        setMessage(`Labels saved for ${result.updatedIds.length} downloads.`);
      }
      setError(
        result.failures.length ? `${result.failures.length} deletions failed. ${result.failures[0]?.message}` : '',
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The action failed. Refresh before trying again.');
    } finally {
      pending.current = false;
      setIsBusy(false);
    }
  }
  /** Records the precise filenames shown during review without deleting or requesting anything. */
  function reviewDeletion(): void {
    if (selectedJobs.length && selectedJobs.every(isBulkDeletable)) {
      setReview(selectedJobs.map((job) => ({ ...job })));
      setMessage('');
      setError('');
    }
  }
  return {
    ids,
    selectedJobs,
    isBusy,
    message,
    error,
    review,
    clear,
    toggle,
    selectVisible,
    reviewDeletion,
    cancelReview: () => setReview(null),
    organize: (edit: Omit<BulkOrganization, 'action' | 'ids'>) =>
      run({
        ...edit,
        action: BULK_ACTION.organize,
        ids: selectedJobs.map((job) => job.id),
      }),
    confirmDeletion: () =>
      review
        ? run({
            action: BULK_ACTION.delete,
            ids: review.map((job) => job.id),
            confirmation: BULK_LIBRARY.confirmation,
          })
        : Promise.resolve(),
  };
}
/** Shared state contract avoids distributing individual selection setters through the component tree. */
export type BulkLibraryState = ReturnType<typeof useBulkLibrary>;
