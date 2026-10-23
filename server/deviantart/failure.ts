import { MEDIA_FAILURE, type MediaFailure } from '../../shared/mediaFailures.js';
import { EngineProcessError, classifyMediaFailure } from '../engines/failures.js';

/** Only fixed codes and application-authored text can leave this diagnostic boundary. */
const RULES: { pattern: RegExp; code: string; reason: MediaFailure; message: string }[] = [
  {
    pattern: /invalid_grant|invalid_client|AuthenticationError/iu,
    code: 'DA-AUTH',
    reason: MEDIA_FAILURE.login,
    message: 'DeviantArt rejected OAuth access. Reconnect the account in Settings.',
  },
  {
    pattern: /CloudFront block|ChallengeError|captcha|turnstile|cloudflare/iu,
    code: 'DA-BROWSER',
    reason: MEDIA_FAILURE.verification,
    message: 'DeviantArt blocked the browser request. Saved cookies and OAuth do not guarantee access from the Pi.',
  },
  {
    pattern: /AuthorizationError|AuthRequired|Only subscribers|premium content|Free download limit/iu,
    code: 'DA-ACCESS',
    reason: MEDIA_FAILURE.access,
    message: 'DeviantArt restricted this content or download. Check access to the original item in your browser.',
  },
  {
    pattern: /NotFoundError|Account is inactive|User not found/iu,
    code: 'DA-NOT-FOUND',
    reason: MEDIA_FAILURE.unavailable,
    message: 'DeviantArt could not find an accessible item or account. Check the original link.',
  },
  {
    pattern: /unrecognized arguments|no such option|ModuleNotFoundError|ImportError/iu,
    code: 'DA-ENGINE',
    reason: MEDIA_FAILURE.utility,
    message: 'The gallery-dl installation or options are incompatible. Update download utilities in Settings.',
  },
  {
    pattern: /PermissionError|No space left on device|Read-only file system|Disk quota exceeded/iu,
    code: 'DA-STORAGE',
    reason: MEDIA_FAILURE.utility,
    message: 'gallery-dl could not write its files. Check free space and permissions on the mounted directories.',
  },
];
/** Converts private extractor output to a specific safe failure without echoing URLs, paths or provider prose.
 * @param {string} diagnostic - Bounded private stderr.
 * @param {number | null} exitCode - Native child exit status.
 * @returns {EngineProcessError} Safe category and useful diagnostic reference.
 */
export function deviantartFailure(diagnostic: string, exitCode: number | null): EngineProcessError {
  const text = diagnostic.replace(/https?:\/\/\S+/giu, '[source]');
  const rule = RULES.find((entry) => entry.pattern.test(text));
  if (rule) {
    return new EngineProcessError(rule.reason, `${rule.message} (${rule.code})`);
  }
  const status = /(?:API responded with|HTTP(?: ?Error)?[: ]+)\s*['"]?([45]\d\d)\b/iu.exec(text)?.[1];
  if (status) {
    const reason =
      status === '401'
        ? MEDIA_FAILURE.login
        : status === '403'
          ? MEDIA_FAILURE.access
          : status === '404'
            ? MEDIA_FAILURE.unavailable
            : status === '429'
              ? MEDIA_FAILURE.rate
              : status.startsWith('5')
                ? MEDIA_FAILURE.network
                : MEDIA_FAILURE.unknown;
    return new EngineProcessError(
      reason,
      `DeviantArt returned HTTP ${status}. Check source access and utility updates. (DA-HTTP-${status})`,
    );
  }
  const exception = /\b(?:JSONDecodeError|KeyError|TypeError|ValueError|AttributeError|IndexError)\b/u.exec(text)?.[0];
  if (
    exception ||
    /Unable to parse API response|Unexpected API response|Unable to extract|Failed to extract/iu.test(text)
  ) {
    return new EngineProcessError(
      MEDIA_FAILURE.unknown,
      `gallery-dl could not read DeviantArt’s response. Update download utilities, then retry. (DA-PARSE${
        exception ? `-${exception}` : ''
      })`,
    );
  }
  if (/Unsupported URL|No suitable extractor/iu.test(text)) {
    return new EngineProcessError(
      MEDIA_FAILURE.unavailable,
      'gallery-dl does not recognize this DeviantArt link. Check the URL and update utilities. (DA-URL)',
    );
  }
  const reason = classifyMediaFailure(text);
  if (reason !== MEDIA_FAILURE.unknown) {
    return new EngineProcessError(reason);
  }
  const code = exitCode === null ? 'signal' : String(exitCode);
  return new EngineProcessError(
    MEDIA_FAILURE.unknown,
    `gallery-dl stopped without a recognized DeviantArt error (DA-UNKNOWN; exit ${code}). ` +
      'Share this code and the link.',
  );
}
