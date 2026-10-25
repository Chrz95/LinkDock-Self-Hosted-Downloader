import { MEDIA_FAILURE } from '../../shared/mediaFailures.js';
import { EngineProcessError, classifyMediaFailure } from './failures.js';

/** Produces actionable video-engine failures without retaining provider output or private source URLs.
 * @param {string} diagnostic - Bounded private engine stderr.
 * @param {number | null} _exitCode - Untrusted process status, not a provider response code.
 * @returns {EngineProcessError} Fixed application-owned category and guidance.
 */
export function videoFailure(diagnostic: string, _exitCode: number | null): EngineProcessError {
  const text = diagnostic.replace(/https?:\/\/\S+/giu, '[source]');
  const reason = classifyMediaFailure(text);
  const missingBrowser = [
    /no impersonate target is available|impersonate target[^\n]{0,100}not available/iu,
    /\b(?:curl_cffi|curl-cffi)\b[^\n]{0,60}(?:not installed|unsupported|unavailable)/iu,
  ].some((pattern) => pattern.test(text));
  if (
    missingBrowser &&
    (reason === MEDIA_FAILURE.unknown ||
      reason === MEDIA_FAILURE.access ||
      reason === MEDIA_FAILURE.network ||
      reason === MEDIA_FAILURE.utility)
  ) {
    return new EngineProcessError(
      MEDIA_FAILURE.utility,
      'The video engine has no usable browser support. Rebuild the latest image or update download utilities. ' +
        '(VIDEO-BROWSER-MISSING)',
    );
  }
  if (reason === MEDIA_FAILURE.unknown && /unable to extract|could not extract|failed to extract/iu.test(text)) {
    return new EngineProcessError(
      reason,
      'The video engine could not read this source page. Update download utilities and check the original link. ' +
        '(VIDEO-EXTRACT)',
    );
  }
  return new EngineProcessError(reason);
}
