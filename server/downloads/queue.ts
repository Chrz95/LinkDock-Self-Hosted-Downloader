import { randomUUID } from 'node:crypto';
import { readdirSync, unlinkSync, rmSync, statfsSync, existsSync } from 'node:fs';
import { DOWNLOAD_STATUS, type DownloadJob, type DashboardSnapshot } from '../../shared/contracts.js';
import { logger } from '../../src/lib/logger/logger.js';
import { LIMIT, TRANSFER } from '../constants.js';
import type { ServerConfig } from '../config.js';
import { SOURCE_TYPE, SOURCE_URL } from '../../shared/sources.js';
import { createQueuedJob, reviewBatch } from './batch.js';
import {
  getQueueOrder,
  JOB_PRIORITY,
  type BatchPreview,
  type BatchResult,
  type JobPriority,
} from '../../shared/batch.js';
import { OUTPUT } from '../engines/constants.js';
import { TorrentRpc } from '../engines/torrent/rpc.js';
import { transferExternal } from '../engines/transferExternal.js';
import { saveUploadedTorrent } from './uploadTorrent.js';
import path from 'node:path';
import { DownloadStore } from './store.js';
import { transferToDisk } from './transfer.js';
import { POLICY_LIMIT } from '../../shared/policy.js';
import { PolicyStore } from '../policy/settings.js';
import { isWindowOpen } from '../policy/schedule.js';
import { ensureStorage, StorageHoldError } from '../policy/storage.js';
import { validateLibraryMetadata } from '../../shared/library.js';
import { ArchiveAccess } from './delivery/access.js';

/** Persistent bounded queue; only lifecycle events write history, progress stays in memory. */
export class DownloadQueue {
  readonly store: DownloadStore;
  readonly archiveAccess = new ArchiveAccess();
  private readonly controllers = new Map<string, AbortController>();
  private isStopping = false;
  private readonly torrentEngine: TorrentRpc;
  readonly policy: PolicyStore;
  private readonly workers = new Map<string, Promise<void>>();
  private readonly policyTimer: ReturnType<typeof setInterval>;
  private minimumFreeBytes = 0;
  private readonly terminalListeners = new Set<(job: DownloadJob) => void>();

  /**
   * Restores resumable queue state and removes orphaned staging and temporary credential sessions.
   * @param {ServerConfig} configuration - Validated runtime configuration.
   */
  constructor(private readonly configuration: ServerConfig) {
    this.torrentEngine = new TorrentRpc(configuration.dataDirectory);
    this.store = new DownloadStore(configuration.dataDirectory);
    this.policy = new PolicyStore(configuration.dataDirectory);
    const resumableIds = new Set(
      this.store.jobs
        .filter((job) => job.status === DOWNLOAD_STATUS.queued || job.status === DOWNLOAD_STATUS.paused)
        .map((job) => job.id),
    );
    for (const filename of readdirSync(this.store.filesDirectory)) {
      if (filename.endsWith(TRANSFER.partialExtension)) {
        const partialJobId = filename.slice(0, -TRANSFER.partialExtension.length);
        if (!resumableIds.has(partialJobId)) {
          unlinkSync(this.store.getFilePath(partialJobId, true));
        }
      }
    }
    for (const filename of readdirSync(this.store.filesDirectory)) {
      if (
        filename.endsWith(OUTPUT.workingSuffix) &&
        !resumableIds.has(filename.slice(0, -OUTPUT.workingSuffix.length))
      ) {
        rmSync(path.join(this.store.filesDirectory, filename), { recursive: true, force: true });
      }
    }
    const sessionsDirectory = path.join(configuration.dataDirectory, OUTPUT.credentialsDirectory);
    if (existsSync(sessionsDirectory)) {
      for (const entry of readdirSync(sessionsDirectory)) {
        if (entry.startsWith(OUTPUT.credentialSessionPrefix)) {
          rmSync(path.join(sessionsDirectory, entry), { recursive: true, force: true });
        }
      }
    }
    this.policyTimer = setInterval(() => this.schedule(), POLICY_LIMIT.timerMilliseconds);
    this.policyTimer.unref();
    this.schedule();
  }

  /**
   * Creates a queued job without trusting a user-supplied path or filename.
   * @param {unknown} sourceUrl - Link submitted by the client.
   * @param {unknown} [requestedType] - Selected engine or automatic detection.
   * @param {unknown} [quality] - Requested site-video resolution policy.
   * @returns {DownloadJob} Persisted new transfer.
   */
  add(sourceUrl: unknown, requestedType?: unknown, quality?: unknown): DownloadJob {
    const result = this.addBatch([sourceUrl], requestedType, quality);
    const [job] = result.added;
    if (!job) {
      throw new Error('This download is already queued or saved in your library.');
    }
    return job;
  }

  /**
   * Reviews every link without mutating history or starting workers.
   * @param {unknown} urls - Submitted link array.
   * @param {unknown} [sourceType] - Common engine choice.
   * @param {unknown} [quality] - Common video resolution.
   * @returns {BatchPreview} Accepted count and skipped duplicate links.
   */
  previewBatch(urls: unknown, sourceType?: unknown, quality?: unknown): BatchPreview {
    const review = reviewBatch(urls, sourceType, quality, this.store.jobs);
    return { newCount: review.unique.length, duplicates: review.duplicates };
  }

  /**
   * Commits validated unique inputs together and starts work only after the atomic history write succeeds.
   * @param {unknown} urls - Submitted link array.
   * @param {unknown} [sourceType] - Common engine choice.
   * @param {unknown} [quality] - Common video resolution.
   * @returns {BatchResult} Persisted new records and skipped duplicates.
   */
  addBatch(urls: unknown, sourceType?: unknown, quality?: unknown): BatchResult {
    const review = reviewBatch(urls, sourceType, quality, this.store.jobs);
    const added = review.unique.map(createQueuedJob);
    if (added.length) {
      this.store.jobs.unshift(...added.toReversed());
      try {
        this.store.save();
      } catch (error) {
        this.store.jobs.splice(0, added.length);
        throw error;
      }
      this.schedule();
    }
    return { added, newCount: added.length, duplicates: review.duplicates };
  }

  /**
   * Queues browser-uploaded torrent metadata with no user-controlled filesystem path.
   * @param {unknown} encodedMetadata - Bounded base64 payload.
   * @param {unknown} displayName - Uploaded filename for display only.
   * @returns {DownloadJob} Persisted metadata-backed job.
   */
  addTorrent(encodedMetadata: unknown, displayName: unknown): DownloadJob {
    if (this.store.jobs.length >= LIMIT.maximumHistory) {
      throw new Error('Remove older downloads first.');
    }
    const jobId = randomUUID();
    const filename = saveUploadedTorrent(encodedMetadata, displayName, jobId, this.configuration.dataDirectory);
    const job: DownloadJob = {
      id: jobId,
      url: `${SOURCE_URL.uploadedTorrent}${jobId}`,
      filename,
      sourceType: SOURCE_TYPE.torrent,
      status: DOWNLOAD_STATUS.queued,
      receivedBytes: 0,
      totalBytes: null,
      bytesPerSecond: 0,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      errorMessage: null,
    };
    this.store.jobs.unshift(job);
    this.store.save();
    this.schedule();
    return job;
  }

  /**
   * Exposes live progress and actual filesystem capacity.
   * @returns {DashboardSnapshot} Current state for polling clients.
   */
  snapshot(): DashboardSnapshot {
    const storage = statfsSync(this.store.filesDirectory);
    return {
      jobs: this.store.jobs,
      concurrency: this.configuration.concurrency,
      maximumFileBytes: this.configuration.maximumFileBytes,
      storage: { availableBytes: storage.bavail * storage.bsize, totalBytes: storage.blocks * storage.bsize },
      policy: { settings: this.policy.settings, holdReason: this.getHoldReason() },
    };
  }

  /** Schedules by priority, then FIFO, without exceeding the configured connection count. */
  schedule(): void {
    if (this.isStopping) {
      return;
    }
    const holdReason = this.getHoldReason();
    if (holdReason) {
      this.suspendActive(holdReason);
      return;
    }
    for (const job of getQueueOrder(this.store.jobs)) {
      if (this.controllers.size >= this.configuration.concurrency) {
        break;
      }
      if (job.status === DOWNLOAD_STATUS.queued && !this.controllers.has(job.id)) {
        const controller = new AbortController();
        this.controllers.set(job.id, controller);
        const worker = this.run(job, controller);
        this.workers.set(job.id, worker);
        void worker.finally(() => {
          if (this.workers.get(job.id) === worker) {
            this.workers.delete(job.id);
          }
        });
      }
    }
  }

  /**
   * Cancels an active or waiting job, cleaning partial bytes before another job starts.
   * @param {DownloadJob} job - Queued or active record.
   */
  cancel(job: DownloadJob): void {
    if (
      ![DOWNLOAD_STATUS.queued, DOWNLOAD_STATUS.downloading, DOWNLOAD_STATUS.paused].some(
        (status) => job.status === status,
      )
    ) {
      throw new Error('Only queued or active downloads can be cancelled.');
    }
    job.status = DOWNLOAD_STATUS.cancelled;
    job.errorMessage = TRANSFER.cancelledMessage;
    job.bytesPerSecond = 0;
    job.finishedAt = new Date().toISOString();
    this.controllers.get(job.id)?.abort();
    if (!this.controllers.has(job.id)) {
      this.clearPartial(job);
    }
    this.store.save();
  }

  /**
   * Suspends a waiting or active transfer without discarding its private partial data.
   * @param {DownloadJob} job - Download selected by the owner.
   * @returns {Promise<void>} Worker has released its files and queue slot.
   */
  async pause(job: DownloadJob): Promise<void> {
    if (job.status !== DOWNLOAD_STATUS.queued && job.status !== DOWNLOAD_STATUS.downloading) {
      throw new Error('Only queued or active downloads can be paused.');
    }
    job.status = DOWNLOAD_STATUS.paused;
    job.stage = 'Paused by you';
    job.bytesPerSecond = 0;
    this.controllers.get(job.id)?.abort();
    this.store.save();
    await this.workers.get(job.id);
  }

  /**
   * Requeues a manually paused transfer; the scheduler still honors time and disk-space holds.
   * @param {DownloadJob} job - Paused record whose worker has stopped.
   */
  resume(job: DownloadJob): void {
    if (job.status !== DOWNLOAD_STATUS.paused || this.controllers.has(job.id)) {
      throw new Error('Wait for the transfer to pause before resuming it.');
    }
    job.status = DOWNLOAD_STATUS.queued;
    job.errorMessage = null;
    job.stage = 'Waiting to resume';
    this.store.save();
    this.schedule();
  }

  /**
   * Restarts a failed or cancelled download from byte zero.
   * @param {DownloadJob} job - Terminal record without a live worker.
   */
  retry(job: DownloadJob): void {
    if (
      this.controllers.has(job.id) ||
      (job.status !== DOWNLOAD_STATUS.failed &&
        job.status !== DOWNLOAD_STATUS.cancelled &&
        job.status !== DOWNLOAD_STATUS.paused)
    ) {
      throw new Error('This download cannot be retried yet.');
    }
    Object.assign(job, {
      status: DOWNLOAD_STATUS.queued,
      receivedBytes: 0,
      totalBytes: null,
      bytesPerSecond: 0,
      finishedAt: null,
      errorMessage: null,
      files: undefined,
      stage: undefined,
      peers: undefined,
      resumeValidator: undefined,
      resumeSourceUrl: undefined,
    });
    this.clearPartial(job);
    if (job.sourceType === SOURCE_TYPE.torrent && !job.url.startsWith(SOURCE_URL.uploadedTorrent)) {
      rmSync(path.join(this.configuration.dataDirectory, OUTPUT.metadataDirectory, `${job.id}.torrent`), {
        force: true,
      });
    }
    this.store.save();
    this.schedule();
  }

  /**
   * Removes terminal history and its associated file; active jobs must be cancelled first.
   * @param {DownloadJob} job - Record to permanently delete.
   */
  remove(job: DownloadJob): void {
    if (this.archiveAccess.has(job.id)) {
      throw new Error('Wait for the ZIP download to finish, or cancel it in your browser, before deleting this job.');
    }
    if (this.controllers.has(job.id) || job.status === DOWNLOAD_STATUS.queued) {
      throw new Error('Cancel this download and wait for cleanup before deleting it.');
    }
    if (job.status === DOWNLOAD_STATUS.completed) {
      rmSync(this.store.getFilePath(job.id), { force: true });
    }
    rmSync(`${this.store.getFilePath(job.id)}${OUTPUT.outputSuffix}`, { recursive: true, force: true });
    this.clearPartial(job);
    rmSync(path.join(this.configuration.dataDirectory, OUTPUT.metadataDirectory, `${job.id}.torrent`), { force: true });
    this.store.jobs.splice(this.store.jobs.indexOf(job), 1);
    this.store.save();
  }

  /**
   * Changes waiting-job priority without preempting active transfers or unpausing manual holds.
   * @param {DownloadJob} job - Waiting or paused record.
   * @param {JobPriority} priority - Validated scheduling level.
   */
  setPriority(job: DownloadJob, priority: JobPriority): void {
    if (
      (job.status !== DOWNLOAD_STATUS.queued && job.status !== DOWNLOAD_STATUS.paused) ||
      this.controllers.has(job.id) ||
      !Object.values(JOB_PRIORITY).some((value) => value === priority)
    ) {
      throw new Error('Only waiting or paused downloads can change priority.');
    }
    const previous = job.priority;
    job.priority = priority;
    try {
      this.store.save();
    } catch (error) {
      job.priority = previous;
      throw error;
    }
    this.schedule();
  }

  /**
   * Saves organization without moving files, interrupting work or retaining partial edits on write failure.
   * @param {DownloadJob} job - Existing owner-selected record in any state.
   * @param {unknown} input - Complete proposed folder and tags.
   */
  organize(job: DownloadJob, input: unknown): void {
    const metadata = validateLibraryMetadata(input);
    const previous = job.library;
    job.library = metadata;
    try {
      this.store.save();
    } catch (error) {
      job.library = previous;
      throw error;
    }
  }

  /**
   * Observes future terminal transitions without delaying download workers for delivery work.
   * @param {(job: DownloadJob) => void} listener - Nonblocking terminal-event consumer.
   * @returns {() => void} Removes the observer during shutdown.
   */
  onTerminal(listener: (job: DownloadJob) => void): () => void {
    this.terminalListeners.add(listener);
    return () => {
      this.terminalListeners.delete(listener);
    };
  }

  /**
   * Runs one transfer and always releases its slot, including failures and cancellation.
   * @param {DownloadJob} job - Record whose progress is updated in place.
   * @param {AbortController} controller - Worker cancellation handle.
   * @returns {Promise<void>} Completion after persistent terminal state.
   */
  private async run(job: DownloadJob, controller: AbortController): Promise<void> {
    try {
      job.status = DOWNLOAD_STATUS.downloading;
      job.stage = undefined;
      this.store.save();
      const { settings } = this.policy;
      const workerConfiguration = {
        ...this.configuration,
        downloadBytesPerSecond: Math.floor(
          (settings.downloadKibPerSecond * POLICY_LIMIT.bytesPerKib) / this.configuration.concurrency,
        ),
        uploadBytesPerSecond: Math.floor(
          (settings.uploadKibPerSecond * POLICY_LIMIT.bytesPerKib) / this.configuration.concurrency,
        ),
        reservedFreeBytes: settings.reserveGib * LIMIT.bytesPerGibibyte,
      };
      if (!job.sourceType || job.sourceType === SOURCE_TYPE.direct) {
        await transferToDisk(job, this.store, controller.signal, this.configuration.maximumFileBytes, {
          bytesPerSecond: workerConfiguration.downloadBytesPerSecond,
          reservedFreeBytes: workerConfiguration.reservedFreeBytes,
          onCheckpoint: () => this.store.save(),
        });
      } else {
        await transferExternal(job, this.store, controller.signal, workerConfiguration, this.torrentEngine);
      }
      job.status = DOWNLOAD_STATUS.completed;
      job.totalBytes = job.receivedBytes;
    } catch (error) {
      if (error instanceof StorageHoldError && job.status === DOWNLOAD_STATUS.downloading) {
        this.minimumFreeBytes = error.requiredFreeBytes;
        job.status = DOWNLOAD_STATUS.queued;
        job.stage = error.message;
      } else if (job.status === DOWNLOAD_STATUS.downloading) {
        job.status = DOWNLOAD_STATUS.failed;
        job.errorMessage = error instanceof Error ? error.message : 'The download failed.';
      }
    } finally {
      job.bytesPerSecond = 0;
      job.finishedAt =
        job.status === DOWNLOAD_STATUS.queued || job.status === DOWNLOAD_STATUS.paused
          ? null
          : new Date().toISOString();
      this.controllers.delete(job.id);
      try {
        this.store.save();
        if (job.status === DOWNLOAD_STATUS.completed || job.status === DOWNLOAD_STATUS.failed) {
          for (const listener of this.terminalListeners) {
            try {
              listener(job);
            } catch (error) {
              logger.error('A download event observer failed.', error);
            }
          }
        }
      } catch (error) {
        logger.error('Unable to persist queue state.', error);
      }
      this.schedule();
    }
  }

  /**
   * Stops new work and preserves progress for automatic recovery on the next startup.
   * @returns {Promise<void>} Active workers have released their resources and saved queue state.
   */
  async stop(): Promise<void> {
    this.isStopping = true;
    clearInterval(this.policyTimer);
    this.suspendActive('Waiting for the station to restart');
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    await Promise.allSettled(this.workers.values());
    this.torrentEngine.stop();
  }

  /**
   * Validates durable preferences and restarts active workers with the new rate allocation.
   * @param {unknown} input - Complete settings submitted by the authenticated owner.
   */
  updateSettings(input: unknown): void {
    const previousSettings = JSON.stringify(this.policy.settings);
    this.policy.update(input);
    if (JSON.stringify(this.policy.settings) === previousSettings) {
      return;
    }
    this.minimumFreeBytes = 0;
    this.suspendActive('Applying station preferences');
    this.schedule();
  }

  /** Returns the current automatic hold. @returns {string | null} Human-readable scheduler reason. */
  private getHoldReason(): string | null {
    const { settings } = this.policy;
    if (!isWindowOpen(settings)) {
      return `Waiting for ${settings.windowStart}–${settings.windowEnd} (${settings.timeZone})`;
    }
    try {
      ensureStorage(
        this.store.filesDirectory,
        Math.max(this.minimumFreeBytes, settings.reserveGib * LIMIT.bytesPerGibibyte),
      );
      return null;
    } catch (error) {
      if (error instanceof StorageHoldError) {
        return error.message;
      }
      return 'Waiting for the data filesystem to become available. Check the storage mount and permissions.';
    }
  }

  /**
   * Requeues active work before aborting so worker cleanup retains partial data.
   * @param {string} reason - Visible hold or reconfiguration explanation.
   */
  private suspendActive(reason: string): void {
    let changed = false;
    for (const job of this.store.jobs) {
      if (job.status === DOWNLOAD_STATUS.downloading) {
        job.status = DOWNLOAD_STATUS.queued;
        job.stage = reason;
        job.bytesPerSecond = 0;
        this.controllers.get(job.id)?.abort();
        changed = true;
      }
    }
    if (changed) {
      try {
        this.store.save();
      } catch (error) {
        logger.error('Unable to persist suspended downloads. Check available disk space.', error);
      }
    }
  }

  /**
   * Deletes only the internal partial paths associated with an already validated job ID.
   * @param {DownloadJob} job - Record being cancelled, restarted or removed.
   */
  private clearPartial(job: DownloadJob): void {
    rmSync(this.store.getFilePath(job.id, true), { force: true });
    rmSync(`${this.store.getFilePath(job.id)}${OUTPUT.workingSuffix}`, { recursive: true, force: true });
    job.resumeValidator = undefined;
    job.resumeSourceUrl = undefined;
  }
}
