import { API_PATH, HTTP_METHOD } from '../../shared/contracts.js';
import { CONTROL, CONTROL_ID } from '../../shared/control.js';
import { JOB_OPTIONS } from '../../shared/jobOptions.js';

const ARGUMENTS = { target: 2, value: 3, scheduled: 4 } as const;
export const CLI_HELP = `LinkDock station commands:
  list
  pause <job-uuid|all> [--at <RFC3339-with-offset>]
  resume <job-uuid|all> [--at <RFC3339-with-offset>]
  schedules
  unschedule <schedule-uuid>
  files <job-uuid>
  select <job-uuid> <indexes, e.g. 1,3-5>
  destination <job-uuid> <relative-folder|->
  retry-move <job-uuid>
Run inside Docker: docker compose exec linkdock node dist-server/server/cli.js <command>
Scheduled times must include seconds and Z or an explicit offset. '-' clears a destination.`;
export interface CliRequest {
  path: string;
  method: string;
  body?: unknown;
  view?: 'list' | 'files';
}

/**
 * Parses a bounded index list without evaluating terminal text.
 * @param {string} value - Comma-delimited indexes/ranges.
 * @returns {number[]} Explicit one-based indexes.
 */
export function parseIndexes(value: string): number[] {
  const indexes: number[] = [];
  for (const part of value.split(',')) {
    if (!/^[1-9]\d*(?:-[1-9]\d*)?$/u.test(part)) {
      throw new Error('Use indexes such as 1,3-5.');
    }
    const [start = 0, finish = start] = part.split('-').map(Number);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(finish) ||
      finish < start ||
      finish > JOB_OPTIONS.maximumFiles ||
      indexes.length + finish - start + 1 > JOB_OPTIONS.maximumFiles
    ) {
      throw new Error('Torrent indexes are outside the supported range.');
    }
    for (let index = start; index <= finish; index += 1) {
      indexes.push(index);
    }
  }
  if (new Set(indexes).size !== indexes.length) {
    throw new Error('Duplicate torrent indexes.');
  }
  return indexes;
}
/**
 * Converts only supported commands into authenticated API requests.
 * @param {string[]} args - Process arguments after the entry filename.
 * @returns {CliRequest | null} Request or help.
 */
export function parseCliArguments(args: string[]): CliRequest | null {
  const [command, target, value, at] = args;
  if (!args.length || (args.length === 1 && ['help', '--help', '-h'].includes(command ?? ''))) {
    return null;
  }
  if (args.length === 1 && command === 'list') {
    return { path: API_PATH.downloads, method: HTTP_METHOD.get, view: 'list' };
  }
  if (args.length === 1 && command === 'schedules') {
    return { path: CONTROL.path, method: HTTP_METHOD.get };
  }
  if (!target || (target !== CONTROL.all && !CONTROL_ID.test(target))) {
    throw new Error('Use a job UUID or all.');
  }
  if (command === CONTROL.pause || command === CONTROL.resume) {
    if (args.length !== ARGUMENTS.target && !(args.length === ARGUMENTS.scheduled && value === '--at' && at)) {
      throw new Error('Use pause/resume <uuid|all> [--at <timestamp>].');
    }
    return { path: CONTROL.path, method: HTTP_METHOD.post, body: { action: command, target, ...(at ? { at } : {}) } };
  }
  if (target === CONTROL.all) {
    throw new Error('This command requires an individual UUID.');
  }
  if (command === 'unschedule' && args.length === ARGUMENTS.target) {
    return { path: `${CONTROL.path}/${target}`, method: HTTP_METHOD.delete, body: {} };
  }
  if (command === 'files' && args.length === ARGUMENTS.target) {
    return { path: API_PATH.downloads, method: HTTP_METHOD.get, body: target, view: 'files' };
  }
  const base = `${API_PATH.downloads}/${target}`;
  if (command === 'select' && args.length === ARGUMENTS.value && value) {
    return { path: `${base}${JOB_OPTIONS.torrent}`, method: HTTP_METHOD.post, body: { indexes: parseIndexes(value) } };
  }
  if (command === 'destination' && args.length === ARGUMENTS.value && value) {
    return {
      path: `${base}${JOB_OPTIONS.destination}`,
      method: HTTP_METHOD.post,
      body: { directory: value === '-' ? null : value },
    };
  }
  if (command === 'retry-move' && args.length === ARGUMENTS.target) {
    return { path: `${base}${JOB_OPTIONS.retryMove}`, method: HTTP_METHOD.post, body: {} };
  }
  throw new Error('Unknown command or arguments. Run --help.');
}
