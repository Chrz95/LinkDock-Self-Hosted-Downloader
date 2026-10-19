import { MEDIA_FAILURE, MEDIA_FAILURE_INFO, type MediaFailure } from '../../shared/mediaFailures.js';
/** Failure output is a hint, not an authoritative provider API. More specific categories take priority. */
const PATTERNS: [MediaFailure, RegExp][] = [
  [
    MEDIA_FAILURE.utility,
    /(?:ffmpeg|ffprobe).{0,50}(?:not found|not installed|missing)|phantomjs|no supported javascript runtime/iu,
  ],
  [MEDIA_FAILURE.drm, /drm[- ]protected|protected by drm|video has drm|digital rights management/iu],
  [MEDIA_FAILURE.rate, /http(?: error)?[: ]+429|429:\s*too many requests|too many requests|rate.limit(?:ed|ing)/iu],
  [MEDIA_FAILURE.verification, /captcha|cloudflare|turnstile|not a bot|verify.{0,30}human/iu],
  [MEDIA_FAILURE.format, /requested format.{0,20}not available|no (?:video )?formats (?:found|available)/iu],
  [
    MEDIA_FAILURE.region,
    /not available (?:in|from) your (?:country|region)|geo[- ]restricted|geographic restriction/iu,
  ],
  [
    MEDIA_FAILURE.login,
    /login|log in|sign in|authentication|invalid_grant|invalid_client|private video|age.?restrict|cookies/iu,
  ],
  [MEDIA_FAILURE.access, /http(?: error)?[: ]+403|403:\s*forbidden|access denied/iu],
  [
    MEDIA_FAILURE.unavailable,
    /video (?:is )?(?:unavailable|not available)|has been (?:removed|deleted)|http error 404/iu,
  ],
  [
    MEDIA_FAILURE.network,
    /timed? out|connection (?:reset|refused)|network is unreachable|name resolution|http(?: error)?[: ]+5\d\d/iu,
  ],
];
/**
 * Classifies bounded diagnostic text without exposing source URLs, paths, credentials or engine-provided prose.
 * @param {string} diagnostic - Private bounded stderr tail.
 * @returns {MediaFailure} Most useful recognized hint, or an honest generic fallback.
 */
export function classifyMediaFailure(diagnostic: string): MediaFailure {
  const message = diagnostic.replace(/https?:\/\/\S+/giu, '[source]');
  return PATTERNS.find(([_reason, pattern]) => pattern.test(message))?.[0] ?? MEDIA_FAILURE.unknown;
}
/** Only a fixed category and safe application-authored message cross the queue boundary. */
export class EngineProcessError extends Error {
  /**
   * Captures one safe engine failure without storing the original diagnostic as a cause or property.
   * @param {MediaFailure} reason - Application-owned diagnostic category.
   * @param {string} [message] - Optional application-owned source-specific recovery message.
   */
  constructor(
    readonly reason: MediaFailure,
    message?: string,
  ) {
    super(message ?? MEDIA_FAILURE_INFO[reason].message);
    this.name = 'EngineProcessError';
  }
}
