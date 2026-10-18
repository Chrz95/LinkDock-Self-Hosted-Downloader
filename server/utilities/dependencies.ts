import { UTILITY } from '../../shared/utilities.js';
import { runUtilityCommand } from './process.js';

const DEPENDENCY = /^([a-z\d][a-z\d+.-]*)(?::(?:any|native))?(?:\s*\((<<|<=|=|>=|>>)\s*([\w.+:~-]+)\))?$/u;
/**
 * Checks signed-package dependency declarations against the image and the two staged aria2 packages.
 * @param {string} declaration - Debian Depends/Pre-Depends field.
 * @param {Map<string, string>} staged - Versions being extracted into the private native root.
 * @param {string} directory - Private command directory.
 * @param {AbortSignal} signal - Update cancellation.
 * @param {NodeJS.ProcessEnv} [environment] - Private update environment.
 * @returns {Promise<void>} Every dependency can be met without replacing base system libraries.
 */
export async function verifyDependencies(
  declaration: string,
  staged: Map<string, string>,
  directory: string,
  signal: AbortSignal,
  environment?: NodeJS.ProcessEnv,
): Promise<void> {
  for (const group of declaration
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    let satisfied = false;
    for (const alternative of group.split('|')) {
      const match = DEPENDENCY.exec(alternative.trim());
      if (!match?.[1]) {
        throw new Error('Unsupported native dependency; rebuild the image.');
      }
      const [, name, operator, required] = match;
      try {
        const version =
          staged.get(name!) ??
          (await runUtilityCommand(
            'dpkg-query',
            ['--show', '--showformat=${Version}', name!],
            directory,
            signal,
            environment,
            UTILITY.versionTimeoutMilliseconds,
          ));
        if (operator && required) {
          await runUtilityCommand(
            'dpkg',
            ['--compare-versions', version, operator, required],
            directory,
            signal,
            environment,
            UTILITY.versionTimeoutMilliseconds,
          );
        }
        satisfied = Boolean(version);
        if (satisfied) {
          break;
        }
      } catch {
        signal.throwIfAborted();
      }
    }
    if (!satisfied) {
      throw new Error('A native dependency needs an image rebuild. Existing tools remain active.');
    }
  }
}
