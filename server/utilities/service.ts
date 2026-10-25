import { UTILITY, UTILITY_STATUS, TOOL_COMMAND, type UtilitySnapshot } from '../../shared/utilities.js';
import type { ServerConfig } from '../config.js';
import { logger } from '../../src/lib/logger/logger.js';
import path from 'node:path';
import { readUtilityJson, utilityIdentity, type ToolRelease, UtilityStore } from './storage.js';
import { prepareUtilityRelease } from './prepare.js';
import { resolveUtility, releaseExecution } from './resolve.js';

type Maintenance = (work: () => Promise<void>) => Promise<boolean>;
/** Serialized private updater; candidate preparation never changes the active release before all checks pass. */
export class UtilityService {
  readonly store: UtilityStore;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly initial: ReturnType<typeof setTimeout>;
  private controller: AbortController | undefined;
  private pending: Promise<void> | undefined;
  private stopped = false;
  private readonly automaticStartAt = Date.now() + UTILITY.initialDelayMilliseconds;
  /**
   * Restores preferences and checks daily during idle periods, with a startup grace period.
   * @param {ServerConfig} configuration - Validated environment and private state root.
   * @param {Maintenance} maintenance - Queue-owned gate, returning false when downloads are active.
   * @param {typeof prepareUtilityRelease} [prepare] - Candidate builder, injectable for lifecycle tests.
   */
  constructor(
    private readonly configuration: ServerConfig,
    private readonly maintenance: Maintenance,
    private readonly prepare = prepareUtilityRelease,
  ) {
    this.store = new UtilityStore(configuration.dataDirectory, configuration.autoUpdateTools ?? false);
    this.timer = setInterval(() => void this.tick(), UTILITY.tickMilliseconds);
    this.timer.unref();
    this.initial = setTimeout(() => void this.tick(), UTILITY.initialDelayMilliseconds);
    this.initial.unref();
  }
  /** Returns safe updater metadata only. @returns {UtilitySnapshot} Public owner-only status. */
  snapshot(): UtilitySnapshot {
    const { current: _current, previous: _previous, ...state } = this.store.state;
    const usingManagedTools = Object.entries(TOOL_COMMAND).every(
      ([id, command]) =>
        resolveUtility(
          id as keyof typeof TOOL_COMMAND,
          this.configuration.dataDirectory,
          this.configuration.runtimeEnvironment,
        ).command !== command,
    );
    return {
      ...state,
      versions: usingManagedTools ? state.versions : {},
      canRollback: Boolean(this.store.state.previous),
      usingManagedTools,
    };
  }
  /**
   * Saves the automatic-check preference; manual requests remain explicit and independent.
   * @param {unknown} enabled - Strict boolean from the owner.
   */
  setEnabled(enabled: unknown): void {
    if (typeof enabled !== 'boolean') {
      throw new Error('Automatic updates must be true or false.');
    }
    this.store.save({ ...this.store.state, enabled });
  }
  /** Requests one update, keeping existing work uninterrupted until the queue is idle. */
  request(): void {
    if (this.stopped) {
      throw new Error('The station is shutting down.');
    }
    if (this.pending || this.store.state.requested) {
      return;
    }
    this.store.save({
      ...this.store.state,
      requested: true,
      status: UTILITY_STATUS.waiting,
      message: 'Utility update queued. Waiting for active downloads to finish.',
    });
    void this.tick();
  }
  /** Cancels a pending or running candidate without changing the active utility set. */
  cancel(): void {
    if (!this.pending && !this.store.state.requested) {
      throw new Error('No utility update is pending.');
    }
    this.controller?.abort(new Error('Utility update canceled.'));
    this.store.save({
      ...this.store.state,
      requested: false,
      status: this.pending ? UTILITY_STATUS.updating : UTILITY_STATUS.idle,
      checkedAt: new Date().toISOString(),
      message: this.pending ? 'Canceling update. Current tools remain active.' : 'Utility update canceled.',
    });
  }
  /**
   * Checks the previous verified release identity/files before selecting it and disabling automatic updates.
   * @returns {Promise<void>} Previous release selected, or no persistent state changed.
   */
  async restorePrevious(): Promise<void> {
    if (this.pending || this.stopped) {
      throw new Error('Wait for the current utility operation to finish.');
    }
    const restored = await this.maintenance(async () => {
      const { previous } = this.store.state;
      if (!previous) {
        throw new Error('No previous managed tools are available.');
      }
      const root = path.join(this.store.directory, 'releases', previous);
      const release = readUtilityJson(path.join(root, 'release.json')) as ToolRelease;
      if (release.id !== previous || release.identity !== utilityIdentity(this.configuration.dataDirectory)) {
        throw new Error('Previous tools do not match this image. Restore bundled tools instead.');
      }
      for (const id of Object.keys(TOOL_COMMAND) as (keyof typeof TOOL_COMMAND)[]) {
        releaseExecution(this.configuration.dataDirectory, previous, id, this.configuration.runtimeEnvironment);
      }
      this.store.save({
        ...this.store.state,
        current: previous,
        previous: this.store.state.current,
        enabled: false,
        requested: false,
        status: UTILITY_STATUS.idle,
        versions: release.versions,
        updatedAt: new Date().toISOString(),
        message: 'Previous tools restored. Automatic updates are disabled.',
      });
    });
    if (!restored) {
      throw new Error('Wait for active downloads to finish, or pause them, before rollback.');
    }
  }

  /**
   * Restores packaged binaries under the idle queue gate and disables future automatic changes.
   * @returns {Promise<void>} Restore committed or actionable busy failure.
   */
  async restoreBundled(): Promise<void> {
    if (this.pending || this.stopped) {
      throw new Error('Cancel the utility update and wait for it to finish first.');
    }
    const changed = await this.maintenance(async () => {
      this.store.save({
        ...this.store.state,
        enabled: false,
        requested: false,
        status: UTILITY_STATUS.idle,
        current: null,
        previous: null,
        versions: {},
        updatedAt: new Date().toISOString(),
        message: 'Bundled tools restored. Automatic updates are disabled.',
      });
    });
    if (!changed) {
      throw new Error('Wait for active downloads to finish, or pause them, before restoring tools.');
    }
  }
  /** Runs at most one requested/due update and never waits for downloads inside the queue gate.
   * @returns {Promise<void>} This attempt settled; a busy queue leaves the request waiting.
   */
  tick(): Promise<void> {
    if (this.pending || this.stopped) {
      return this.pending ?? Promise.resolve();
    }
    if (!this.store.state.requested && Date.now() < this.automaticStartAt) {
      return Promise.resolve();
    }
    const last = this.store.state.checkedAt ? Date.parse(this.store.state.checkedAt) : 0;
    if (
      !this.store.state.requested &&
      (!this.store.state.enabled || Date.now() - last < UTILITY.intervalMilliseconds)
    ) {
      return Promise.resolve();
    }
    this.pending = this.perform()
      .catch((error: unknown) => {
        logger.error('Unable to persist utility update state. Existing tools remain selected.', error);
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  /** Prepares and activates one complete verified release. @returns {Promise<void>} Attempt settled. */
  private async perform(): Promise<void> {
    await this.maintenance(async () => {
      this.controller = new AbortController();
      const { signal } = this.controller;
      const checkedAt = new Date().toISOString();
      let step = 'Preparing utility update';
      try {
        this.store.save({
          ...this.store.state,
          requested: true,
          status: UTILITY_STATUS.updating,
          checkedAt,
          message: 'Preparing utility update. Downloads will resume afterward.',
        });
        this.store.prune();
        const release = await this.prepare(
          this.store,
          signal,
          (message) => {
            step = message;
            this.store.save({ ...this.store.state, message });
          },
          this.configuration.runtimeEnvironment,
        );
        signal.throwIfAborted();
        this.store.save({
          ...this.store.state,
          current: release.id,
          previous: this.store.state.current,
          requested: false,
          status: UTILITY_STATUS.idle,
          checkedAt,
          updatedAt: new Date().toISOString(),
          versions: release.versions,
          message: 'Utility update verified and activated. Downloads can resume.',
        });
        try {
          this.store.prune();
        } catch (error) {
          logger.error('Inactive utility cleanup failed after successful activation.', error);
        }
      } catch (error) {
        logger.error('Utility update did not complete; the last active tool set is retained.', error);
        this.store.save({
          ...this.store.state,
          requested: false,
          checkedAt,
          status: signal.aborted ? UTILITY_STATUS.idle : UTILITY_STATUS.failed,
          message: signal.aborted
            ? 'Utility update canceled. Current tools remain active.'
            : `Update failed during: ${step} ` +
              'Check storage, network and image compatibility. Current tools remain active.',
        });
      } finally {
        this.controller = undefined;
      }
    });
  }
  /** Stops timers and cancels the candidate process group. @returns {Promise<void>} Updater settled. */
  async stop(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.initial);
    this.controller?.abort(new Error('Station shutting down.'));
    await this.pending;
  }
}
