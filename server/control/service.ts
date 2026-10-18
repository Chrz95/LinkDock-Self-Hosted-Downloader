import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  CONTROL,
  CONTROL_ID,
  validateControlTime,
  type ControlAction,
  type ControlState,
  type ScheduledControl,
} from '../../shared/control.js';
import { DOWNLOAD_STATUS } from '../../shared/contracts.js';
import { savePrivateJson } from '../notifications/store.js';
import type { DownloadQueue } from '../downloads/queue.js';

/** Durable global pause gate and bounded one-shot commands; replayed running commands are idempotent. */
export class QueueControls {
  private state: ControlState;
  private readonly filename: string;
  private readonly timer: ReturnType<typeof setInterval>;
  private serial: Promise<void> = Promise.resolve();
  private ticking = false;
  private stopping = false;
  ready = true;
  /**
   * Loads controls before workers become eligible, recovering overdue actions ahead of startup downloads.
   * @param {string} dataDirectory - Existing owner volume.
   * @param {DownloadQueue} queue - Owned queue lifecycle.
   */
  constructor(
    dataDirectory: string,
    private readonly queue: DownloadQueue,
  ) {
    this.filename = path.join(dataDirectory, 'controls.json');
    if (existsSync(this.filename) && statSync(this.filename).size > CONTROL.maximumStateBytes) {
      throw new Error('Saved terminal controls are too large. Restore controls.json from backup.');
    }
    const input: unknown = existsSync(this.filename)
      ? JSON.parse(readFileSync(this.filename, 'utf8'))
      : { paused: false, tasks: [] };
    this.state = validateControlState(input);
    this.state.tasks = this.state.tasks.map((task) => ({
      ...task,
      status: task.status === 'running' ? 'pending' : task.status,
    }));
    this.ready = !this.state.tasks.some((task) => task.status === 'pending' && Date.parse(task.at) <= Date.now());
    this.timer = setInterval(() => void this.tick(), CONTROL.tickMilliseconds);
    this.timer.unref();
    queueMicrotask(() => void this.tick());
  }
  /** Returns isolated control state. @returns {ControlState} Global gate and bounded task history. */
  snapshot(): ControlState {
    return structuredClone(this.state);
  }
  /** Returns the persistent global pause gate. @returns {boolean} Whether new work is held. */
  get isPaused(): boolean {
    return this.state.paused;
  }
  /**
   * Publishes before changing the in-memory gate or scheduled actions.
   * @param {ControlState} next - Complete validated next state.
   */
  private save(next: ControlState): void {
    savePrivateJson(this.filename, next);
    this.state = next;
  }
  /**
   * Schedules a fixed one-shot command or executes it serially, never evaluating shell text.
   * @param {unknown} action - Pause or resume.
   * @param {unknown} target - Existing UUID or all.
   * @param {unknown} [at] - Future explicitly offset timestamp.
   * @returns {Promise<object>} Immediate count or persisted schedule.
   */
  async command(
    action: unknown,
    target: unknown,
    at?: unknown,
  ): Promise<{ affected?: number; task?: ScheduledControl }> {
    if (
      this.stopping ||
      (action !== CONTROL.pause && action !== CONTROL.resume) ||
      typeof target !== 'string' ||
      (target !== CONTROL.all && (!CONTROL_ID.test(target) || !this.queue.store.jobs.some((job) => job.id === target)))
    ) {
      throw new Error('Choose pause/resume and an existing job UUID or all.');
    }
    if (at !== undefined) {
      const task: ScheduledControl = {
        id: randomUUID(),
        action,
        target,
        at: validateControlTime(at),
        status: 'pending',
        message: null,
      };
      const tasks = this.state.tasks.filter((item) => item.status === 'pending' || item.status === 'running');
      if (tasks.length >= CONTROL.maximumTasks) {
        throw new Error('The schedule limit is reached.');
      }
      const history = this.state.tasks.filter((item) => item.status !== 'pending' && item.status !== 'running');
      this.save({ ...this.state, tasks: [...history, ...tasks, task].slice(-CONTROL.maximumTasks) });
      return { task };
    }
    let affected = 0;
    const work = this.serial.then(async () => {
      affected = await this.execute(action, target);
    });
    this.serial = work.catch(() => undefined);
    await work;
    return { affected };
  }
  /**
   * Executes idempotent state commands, keeping metadata-review jobs paused until explicit selection.
   * @param {ControlAction} action - Pause or resume.
   * @param {string} target - Fixed UUID or dynamically evaluated all jobs.
   * @returns {Promise<number>} Jobs whose state changed.
   */
  private async execute(action: ControlAction, target: string): Promise<number> {
    if (target === CONTROL.all) {
      this.save({ ...this.state, paused: action === CONTROL.pause });
      if (action === CONTROL.pause) {
        return this.queue.pauseAll();
      }
      return this.queue.resumeAll();
    }
    const job = this.queue.store.jobs.find((item) => item.id === target);
    if (!job) {
      throw new Error('Scheduled download no longer exists.');
    }
    if (action === CONTROL.pause) {
      if (job.status === DOWNLOAD_STATUS.paused) {
        return 0;
      }
      await this.queue.pause(job);
    } else {
      if (job.status === DOWNLOAD_STATUS.queued || job.status === DOWNLOAD_STATUS.downloading) {
        return 0;
      }
      this.queue.resume(job);
    }
    return 1;
  }
  /**
   * Removes only a pending action; executing commands cannot be recalled.
   * @param {string} id - Existing schedule UUID.
   */
  cancel(id: string): void {
    if (!this.state.tasks.some((task) => task.id === id && task.status === 'pending')) {
      throw new Error('That schedule is missing or already executing.');
    }
    this.save({ ...this.state, tasks: this.state.tasks.filter((task) => task.id !== id) });
  }
  /** Runs overdue actions in timestamp/FIFO order. @returns {Promise<void>} Tick settled. */
  async tick(): Promise<void> {
    if (this.ticking || this.stopping) {
      return;
    }
    this.ticking = true;
    try {
      const due = this.state.tasks
        .filter((task) => task.status === 'pending' && Date.parse(task.at) <= Date.now())
        .sort((first, second) => Date.parse(first.at) - Date.parse(second.at));
      for (const task of due) {
        const work = this.serial.then(async () => {
          if (this.stopping || !this.state.tasks.some((item) => item.id === task.id)) {
            return;
          }
          this.update(task.id, 'running', null);
          try {
            const affected = await this.execute(task.action, task.target);
            this.update(task.id, 'done', `${affected} downloads changed.`);
          } catch {
            this.update(task.id, 'failed', 'Command failed. Check the job state and station storage.');
          }
        });
        this.serial = work.catch(() => undefined);
        await work;
      }
      this.ready = true;
      this.queue.schedule();
    } catch {
      this.state = {
        ...this.state,
        tasks: this.state.tasks.map((task) => (task.status === 'running' ? { ...task, status: 'pending' } : task)),
      };
      this.ready = false;
    } finally {
      this.ticking = false;
    }
  }
  /**
   * Persists a task transition before exposing it in memory.
   * @param {string} id - Existing task.
   * @param {ScheduledControl['status']} status - Next durable state.
   * @param {string | null} message - Safe outcome text.
   */
  private update(id: string, status: ScheduledControl['status'], message: string | null): void {
    this.save({
      ...this.state,
      tasks: this.state.tasks.map((task) => (task.id === id ? { ...task, status, message } : task)),
    });
  }
  /** Stops future actions and joins the serialized command. @returns {Promise<void>} Controls settled. */
  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.serial;
  }
}

/**
 * Refuses malformed durable commands rather than turning corrupted data into automatic actions.
 * @param {unknown} input - Parsed private control state.
 * @returns {ControlState} Canonical state safe for execution.
 */
export function validateControlState(input: unknown): ControlState {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid saved terminal controls.');
  }
  const state = input as Record<string, unknown>;
  if (typeof state.paused !== 'boolean' || !Array.isArray(state.tasks) || state.tasks.length > CONTROL.maximumTasks) {
    throw new Error('Invalid saved terminal controls.');
  }
  const ids = new Set<string>();
  const tasks = state.tasks.map((item: unknown): ScheduledControl => {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid saved command.');
    }
    const task = item as Record<string, unknown>;
    if (
      typeof task.id !== 'string' ||
      !CONTROL_ID.test(task.id) ||
      ids.has(task.id) ||
      (task.action !== CONTROL.pause && task.action !== CONTROL.resume) ||
      typeof task.target !== 'string' ||
      (task.target !== CONTROL.all && !CONTROL_ID.test(task.target)) ||
      typeof task.at !== 'string' ||
      !Number.isFinite(Date.parse(task.at)) ||
      new Date(task.at).toISOString() !== task.at ||
      !['pending', 'running', 'done', 'failed'].includes(String(task.status)) ||
      (task.message !== null && (typeof task.message !== 'string' || task.message.length > CONTROL.maximumStateBytes))
    ) {
      throw new Error('Invalid saved command.');
    }
    ids.add(task.id);
    return {
      id: task.id,
      action: task.action,
      target: task.target,
      at: task.at,
      status: task.status as ScheduledControl['status'],
      message: task.message as string | null,
    };
  });
  return { paused: state.paused, tasks };
}
