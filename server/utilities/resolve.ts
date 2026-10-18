import { accessSync, constants, existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { TOOL_COMMAND, type ToolId } from '../../shared/utilities.js';
import { CONTROL_ID } from '../../shared/control.js';
import { readUtilityJson, utilityIdentity, validateUtilityState, type ToolRelease } from './storage.js';
import { readRuntimeEnvironment } from '../config.js';
import { safeDirectory } from '../downloads/completion/paths.js';

export interface ToolExecution {
  command: string;
  environment?: NodeJS.ProcessEnv;
}
export const LIBRARY_TRIPLE = { arm64: 'aarch64-linux-gnu', x64: 'x86_64-linux-gnu' } as const;
/**
 * Resolves one fixed command inside a locally prepared, compatible UUID release.
 * @param {string} dataDirectory - Station state root.
 * @param {string} id - Validated candidate or active release ID.
 * @param {ToolId} tool - Whitelisted utility.
 * @param {NodeJS.ProcessEnv} [environment] - Existing service environment for native library overrides.
 * @returns {ToolExecution} Absolute executable and optional native library search directory.
 */
export function releaseExecution(
  dataDirectory: string,
  id: string,
  tool: ToolId,
  environment?: NodeJS.ProcessEnv,
): ToolExecution {
  if (!CONTROL_ID.test(id)) {
    throw new Error('Invalid utility release.');
  }
  const root = safeDirectory(path.join(dataDirectory, 'utilities', 'releases', id));
  const relative = tool === 'torrent' ? 'native/usr/bin/aria2c' : `python/bin/${TOOL_COMMAND[tool]}`;
  const command = path.join(root, relative);
  safeDirectory(path.dirname(command));
  if (!lstatSync(command).isFile()) {
    throw new Error('Invalid managed executable.');
  }
  accessSync(command, constants.X_OK);
  if (tool !== 'torrent') {
    return { command };
  }
  const triple = LIBRARY_TRIPLE[process.arch as keyof typeof LIBRARY_TRIPLE];
  if (!triple) {
    throw new Error('Native updates require Linux ARM64 or AMD64.');
  }
  const libraries = safeDirectory(path.join(root, 'native', 'usr', 'lib', triple));
  return { command, environment: { ...(environment ?? readRuntimeEnvironment()), LD_LIBRARY_PATH: libraries } };
}
/**
 * Uses the last activated compatible utility set, falling back to packaged tools if state is missing or invalid.
 * @param {ToolId} tool - Application-selected tool.
 * @param {string} dataDirectory - Persistent app state.
 * @param {NodeJS.ProcessEnv} [environment] - Service environment for native execution.
 * @returns {ToolExecution} Fixed packaged command or a validated managed executable.
 */
export function resolveUtility(tool: ToolId, dataDirectory: string, environment?: NodeJS.ProcessEnv): ToolExecution {
  try {
    const filename = path.join(dataDirectory, 'utilities', 'state.json');
    if (!existsSync(filename)) {
      return { command: TOOL_COMMAND[tool] };
    }
    const state = validateUtilityState(readUtilityJson(filename));
    if (typeof state.current !== 'string' || !CONTROL_ID.test(state.current)) {
      throw new Error('No active release.');
    }
    const release = readUtilityJson(
      path.join(dataDirectory, 'utilities', 'releases', state.current, 'release.json'),
    ) as ToolRelease;
    if (release.id !== state.current || release.identity !== utilityIdentity(dataDirectory)) {
      throw new Error('Incompatible managed release.');
    }
    return releaseExecution(dataDirectory, state.current, tool, environment);
  } catch {
    return { command: TOOL_COMMAND[tool] };
  }
}
