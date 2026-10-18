import { existsSync, mkdirSync, readFileSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { UTILITY, UTILITY_STATUS, type UtilitySnapshot, type ToolId } from '../../shared/utilities.js';
import { CONTROL_ID } from '../../shared/control.js';
import { savePrivateJson } from '../notifications/store.js';
import { safeDirectory } from '../downloads/completion/paths.js';

export interface UtilityState extends Omit<UtilitySnapshot, 'usingManagedTools' | 'canRollback'> {
  current: string | null;
  previous: string | null;
}
export interface ToolRelease {
  id: string;
  identity: string;
  versions: Partial<Record<ToolId, string>>;
}
/**
 * Invalidates native/venv releases when their installation location or base Python image changes.
 * @param {string} dataDirectory - Persistent installation root.
 * @returns {string} Local runtime identity, never sent to the browser.
 */
export function utilityIdentity(dataDirectory: string): string {
  const python = '/opt/media/pyvenv.cfg';
  const base = existsSync(python) ? readFileSync(python, 'utf8') : 'non-docker';
  return createHash('sha256')
    .update(`${path.resolve(dataDirectory)}:${process.platform}:${process.arch}:${base}`)
    .digest('hex');
}
/**
 * Reads small private records without accepting symlinked state files.
 * @param {string} filename - Server-owned path.
 * @returns {unknown} Parsed bounded record.
 */
export function readUtilityJson(filename: string): unknown {
  const information = lstatSync(filename, { throwIfNoEntry: false });
  if (!information?.isFile() || information.size > UTILITY.maximumStateBytes) {
    throw new Error('Invalid utility state.');
  }
  return JSON.parse(readFileSync(filename, 'utf8'));
}
/**
 * Validates persisted updater controls before they can select executable locations.
 * @param {unknown} input - Saved private JSON.
 * @returns {UtilityState} Canonical bounded state.
 */
export function validateUtilityState(input: unknown): UtilityState {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid utility state.');
  }
  const state = input as UtilityState;
  if (
    typeof state.enabled !== 'boolean' ||
    typeof state.requested !== 'boolean' ||
    ![UTILITY_STATUS.idle, UTILITY_STATUS.waiting, UTILITY_STATUS.updating, UTILITY_STATUS.failed].includes(
      state.status,
    ) ||
    typeof state.message !== 'string' ||
    state.message.length > UTILITY.maximumOutputBytes ||
    [state.current, state.previous].some((id) => id !== null && (typeof id !== 'string' || !CONTROL_ID.test(id))) ||
    [state.checkedAt, state.updatedAt].some(
      (date) => date !== null && (typeof date !== 'string' || !Number.isFinite(Date.parse(date))),
    ) ||
    !state.versions ||
    typeof state.versions !== 'object' ||
    Object.entries(state.versions).some(
      ([key, value]) =>
        !['video', 'instagram', 'torrent'].includes(key) ||
        typeof value !== 'string' ||
        !value ||
        value.length > UTILITY.maximumVersionCharacters,
    )
  ) {
    throw new Error('Invalid utility state.');
  }
  return {
    enabled: state.enabled,
    requested: state.requested,
    status: state.status,
    message: state.message,
    current: state.current,
    previous: state.previous,
    checkedAt: state.checkedAt,
    updatedAt: state.updatedAt,
    versions: { ...state.versions },
  };
}
/** Persistent owner settings and atomic active-release pointer; downloads never execute an incomplete release. */
export class UtilityStore {
  readonly directory: string;
  state: UtilityState;
  /**
   * Restores interrupted requests without activating incomplete candidate directories.
   * @param {string} dataDirectory - Persistent app state.
   * @param {boolean} automatic - Default only when no saved preference exists.
   */
  constructor(
    readonly dataDirectory: string,
    automatic: boolean,
  ) {
    this.directory = safeDirectory(path.join(dataDirectory, 'utilities'), true);
    mkdirSync(path.join(this.directory, 'releases'), { recursive: true, mode: 0o700 });
    const filename = path.join(this.directory, 'state.json');
    this.state = {
      enabled: automatic,
      requested: false,
      status: UTILITY_STATUS.idle,
      message: 'Tools packaged with the image are available.',
      current: null,
      previous: null,
      checkedAt: null,
      updatedAt: null,
      versions: {},
    };
    if (existsSync(filename)) {
      try {
        this.state = validateUtilityState(readUtilityJson(filename));
        if (this.state.status === UTILITY_STATUS.updating) {
          this.state.status = UTILITY_STATUS.waiting;
          this.state.requested = true;
          this.state.message = 'Recovering an interrupted utility update when downloads are idle.';
        }
      } catch {
        this.state.enabled = false;
        this.state.status = UTILITY_STATUS.failed;
        this.state.message =
          'Saved updater state is invalid. Bundled tools remain available. Save preferences to reset.';
      }
    }
  }
  /**
   * Publishes state before exposing new settings or executable pointers in memory.
   * @param {UtilityState} next - Validated next state.
   */
  save(next: UtilityState): void {
    savePrivateJson(path.join(this.directory, 'state.json'), validateUtilityState(next));
    this.state = next;
  }
  /**
   * Removes only inactive UUID release directories while no download worker can use them.
   * @param {string[]} [extra] - Additional release IDs temporarily retained during preparation.
   */
  prune(extra: string[] = []): void {
    const keep = new Set([this.state.current, this.state.previous, ...extra]);
    for (const entry of readdirSync(path.join(this.directory, 'releases'))) {
      if (CONTROL_ID.test(entry) && !keep.has(entry)) {
        rmSync(path.join(this.directory, 'releases', entry), { recursive: true, force: true });
      }
    }
  }
}
