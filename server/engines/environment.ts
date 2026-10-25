import { readRuntimeEnvironment } from '../config.js';

/** Keeps all media requests on the guarded proxy, including libcurl requests to NO_PROXY destinations.
 * @param {NodeJS.ProcessEnv} [environment] - Managed environment or the inherited station environment.
 * @returns {NodeJS.ProcessEnv} Private copy without ambient proxy bypass/override settings.
 */
export function mediaEnvironment(environment: NodeJS.ProcessEnv = readRuntimeEnvironment()): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !/^(?:https?|all|no)_proxy$/iu.test(key)));
}
