import { Router } from 'express';
import { HTTP_STATUS, type DownloadJob } from '../../shared/contracts.js';
import {
  BULK_LIBRARY,
  BULK_ACTION,
  validateBulkLibrary,
  mergeBulkOrganization,
  isBulkDeletable,
  type BulkLibraryResult,
  type BulkOrganization,
} from '../../shared/bulkLibrary.js';
import type { DownloadQueue } from './queue.js';
import { logger } from '../../src/lib/logger/logger.js';

/**
 * Commits every merged label in one history write, restoring all old values on failure.
 * @param {DownloadQueue} queue - Owner's persistent queue.
 * @param {DownloadJob[]} jobs - Fully resolved unique selection.
 * @param {BulkOrganization} edit - Validated partial operation.
 * @returns {BulkLibraryResult} Updated identifiers after durable persistence.
 */
function organizeSelection(queue: DownloadQueue, jobs: DownloadJob[], edit: BulkOrganization): BulkLibraryResult {
  const replacements = jobs.map((job) => mergeBulkOrganization(job.library, edit));
  const previous = jobs.map((job) => job.library);
  jobs.forEach((job, index) => {
    job.library = replacements[index];
  });
  try {
    queue.store.save();
  } catch (error) {
    jobs.forEach((job, index) => {
      job.library = previous[index];
    });
    throw error;
  }
  return { updatedIds: jobs.map((job) => job.id), deletedIds: [], failures: [] };
}

/**
 * Checks the whole selection before deleting anything, then acknowledges each filesystem outcome.
 * @param {DownloadQueue} queue - Owner's persistent queue.
 * @param {DownloadJob[]} jobs - Fully resolved unique selection.
 * @returns {BulkLibraryResult} Successful removals and safe per-record failure messages.
 */
function deleteSelection(queue: DownloadQueue, jobs: DownloadJob[]): BulkLibraryResult {
  for (const job of jobs) {
    if (!isBulkDeletable(job)) {
      throw new Error('Bulk deletion requires finished downloads. Cancel or finish active and paused jobs first.');
    }
    queue.assertRemovable(job);
  }
  const result: BulkLibraryResult = { updatedIds: [], deletedIds: [], failures: [] };
  for (const job of jobs) {
    try {
      queue.remove(job);
      result.deletedIds.push(job.id);
    } catch (error) {
      logger.error('Bulk file deletion failed.', error);
      result.failures.push({
        id: job.id,
        message: 'Deletion failed. Some files may already be removed; retry this job.',
      });
    }
  }
  return result;
}

/**
 * Handles owner-only bulk commands beneath the existing session and JSON origin protections.
 * @param {DownloadQueue} queue - Shared queue with no new download worker behavior.
 * @returns {Router} Bounded explicit-selection mutation endpoint.
 */
export function createBulkLibraryRoutes(queue: DownloadQueue): Router {
  const router = Router();
  router.post(BULK_LIBRARY.path, (request, response) => {
    let edit;
    try {
      edit = validateBulkLibrary(request.body);
    } catch (error) {
      response.status(HTTP_STATUS.badRequest).json({ error: error instanceof Error ? error.message : 'Invalid edit.' });
      return;
    }
    const jobs = edit.ids.map((id) => queue.store.jobs.find((job) => job.id === id));
    if (jobs.some((job) => !job)) {
      response
        .status(HTTP_STATUS.conflict)
        .json({ error: 'The selection changed. Refresh and select downloads again.' });
      return;
    }
    try {
      const selected = jobs.filter((job): job is DownloadJob => Boolean(job));
      response.json(
        edit.action === BULK_ACTION.organize
          ? organizeSelection(queue, selected, edit)
          : deleteSelection(queue, selected),
      );
    } catch (error) {
      logger.error('Bulk library action failed.', error);
      response.status(HTTP_STATUS.conflict).json({
        error:
          edit.action === BULK_ACTION.delete && error instanceof Error
            ? error.message
            : 'Labels could not be saved. Check tag limits and station storage; no labels were changed.',
      });
    }
  });
  return router;
}
