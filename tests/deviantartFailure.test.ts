import { expect, it } from 'vitest';
import { deviantartFailure } from '../server/deviantart/failure';
import { runEngineProcess } from '../server/engines/runProcess';
import { MEDIA_FAILURE } from '../shared/mediaFailures';

it.each([
  ['AuthorizationError: subscriber required', 'DA-ACCESS', MEDIA_FAILURE.access],
  ['AuthRequired: restricted item', 'DA-ACCESS', MEDIA_FAILURE.access],
  ['AuthenticationError: invalid_grant', 'DA-AUTH', MEDIA_FAILURE.login],
  ['NotFoundError: deviation', 'DA-NOT-FOUND', MEDIA_FAILURE.unavailable],
  ['KeyError: private-field', 'DA-PARSE-KeyError', MEDIA_FAILURE.unknown],
  ['JSONDecodeError: private-response', 'DA-PARSE-JSONDecodeError', MEDIA_FAILURE.unknown],
  ['Unable to parse API response', 'DA-PARSE', MEDIA_FAILURE.unknown],
  ['API responded with 403 Forbidden\nUnexpected API response', 'DA-HTTP-403', MEDIA_FAILURE.access],
  ['API responded with 401 Unauthorized', 'DA-HTTP-401', MEDIA_FAILURE.login],
  ['API responded with 404 Not Found', 'DA-HTTP-404', MEDIA_FAILURE.unavailable],
  ['API responded with 429 Too Many Requests', 'DA-HTTP-429', MEDIA_FAILURE.rate],
  ["HttpError: '403 Forbidden' for 'https://example.com/?token=secret'", 'DA-HTTP-403', MEDIA_FAILURE.access],
  ['ChallengeError: browser required', 'DA-BROWSER', MEDIA_FAILURE.verification],
  ['HttpError: 503 service unavailable', 'DA-HTTP-503', MEDIA_FAILURE.network],
  ['API responded with 400 Bad Request', 'DA-HTTP-400', MEDIA_FAILURE.unknown],
  ['CloudFront block', 'DA-BROWSER', MEDIA_FAILURE.verification],
  ['unrecognized arguments: --private-argument', 'DA-ENGINE', MEDIA_FAILURE.utility],
  ['PermissionError: /private/path', 'DA-STORAGE', MEDIA_FAILURE.utility],
  ['Unsupported URL: https://example.com/?token=secret', 'DA-URL', MEDIA_FAILURE.unavailable],
  ['provider-private-response', 'DA-UNKNOWN; exit 1', MEDIA_FAILURE.unknown],
])('retains a safe specific DeviantArt hint for %s', (diagnostic, code, reason) => {
  const failure = deviantartFailure(`${diagnostic}\nhttps://example.com/?token=secret\nrefresh_token=secret`, 1);
  expect(failure.reason).toBe(reason);
  expect(failure.message).toContain(code);
  expect(failure.message).not.toMatch(/secret|private-|https?:|refresh_token/);
});

it('does not diagnose errors from URLs alone and never echoes unknown provider prose', () => {
  const error = deviantartFailure('https://example.com/?AuthenticationError=secret&KeyError=secret', null);
  expect(error.reason).toBe(MEDIA_FAILURE.unknown);
  expect(error.message).toContain('exit signal');
  expect(error.message).not.toContain('secret');
});

it('uses source diagnostics at the real process failure boundary without exposing private output', async () => {
  const failed = runEngineProcess(
    process.execPath,
    ['-e', "process.stderr.write('KeyError: private-token'); process.exit(1)"],
    new AbortController().signal,
    () => undefined,
    { failure: deviantartFailure },
  );
  await expect(failed).rejects.toThrow('DA-PARSE-KeyError');
  await expect(failed).rejects.not.toThrow('private-token');
});
