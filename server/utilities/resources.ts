import { readdir, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { UTILITY } from '../../shared/utilities.js';
import { ensureStorage } from '../policy/storage.js';

const RESOURCE = { sampleMilliseconds: 5_000, maximumEntries: 50_000 } as const;
/**
 * Counts only regular private files, tolerating installer renames without following Python/native symlinks.
 * @param {string} directory - Owned update/cached-index root.
 * @param {{count: number}} budget - Shared bounded traversal counter.
 * @returns {Promise<number>} Current non-symlink bytes.
 */
async function countBytes(directory: string, budget: { count: number }): Promise<number> {
  let bytes = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
  for (const entry of entries) {
    budget.count += 1;
    if (budget.count > RESOURCE.maximumEntries) {
      throw new Error('Utility update contains too many files.');
    }
    const filename = path.join(directory, entry.name);
    try {
      const information = await lstat(filename);
      if (information.isDirectory()) {
        bytes += await countBytes(filename, budget);
      } else if (information.isFile()) {
        bytes += information.size;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return bytes;
}
/** Samples space and private installer files without overlapping directory walks. */
export class UtilityResources {
  private readonly controller = new AbortController();
  readonly signal: AbortSignal;
  private readonly timer: ReturnType<typeof setInterval>;
  private measurement: Promise<void> | undefined;
  /**
   * Watches the candidate and signed-index cache; never scans downloaded media or application secrets.
   * @param {string} root - Candidate directory.
   * @param {string} utilities - Persistent utility root.
   * @param {AbortSignal} signal - External cancellation.
   */
  constructor(
    private readonly root: string,
    private readonly utilities: string,
    signal: AbortSignal,
  ) {
    this.signal = AbortSignal.any([signal, this.controller.signal]);
    this.timer = setInterval(() => {
      this.measurement ??= this.measure().finally(() => {
        this.measurement = undefined;
      });
    }, RESOURCE.sampleMilliseconds);
    this.timer.unref();
  }
  /** Applies the free-space reserve and bounded update-staging limit. @returns {Promise<void>} Sample settled. */
  private async measure(): Promise<void> {
    try {
      ensureStorage(this.utilities, UTILITY.minimumFreeBytes);
      const budget = { count: 0 };
      let bytes = await countBytes(this.root, budget);
      const apt = path.join(this.utilities, 'apt');
      if (existsSync(apt)) {
        bytes += await countBytes(apt, budget);
      }
      if (bytes > UTILITY.maximumStagingBytes) {
        throw new Error('Utility update exceeds its staging-space budget.');
      }
    } catch (error) {
      this.controller.abort(error);
    }
  }
  /** Stops sampling and waits for the last scan. @returns {Promise<void>} Files can be published or cleaned safely. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.measurement;
  }
}
