import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { LIMIT, TRANSFER } from '../constants.js';
import { parseTargetUrl, resolvePublicTarget } from '../security/target.js';
import { browserHeaders, type SourceAccess } from '../browserAccess/headers.js';
import { retryAfterSeconds, waitForSource } from '../browserAccess/wait.js';
import { BROWSER_ACCESS } from '../../shared/browserAccess.js';
import { SourceRetryError, sourceRetryAfter, transientHttpStatus } from './retry.js';
const SOURCE_HTTP = { throttled: 429, unavailable: 503, unauthorized: 401, forbidden: 403 } as const;

/** Internal response metadata binds entity tags to the exact final resource after redirects. */
export interface SourceResponse extends IncomingMessage {
  sourceUrl?: string;
}

/**
 * Opens a pinned, validated public destination and validates each redirect separately.
 * @param {URL} target - Initial or redirected destination.
 * @param {AbortSignal} signal - Cancellation propagated to the active request.
 * @param {number} redirectCount - Redirects already followed.
 * @param {Record<string, string>} headers - Internal range request headers, never browser-supplied.
 * @param {SourceAccess} [access] - Per-transfer credentials and source-wait feedback.
 * @param {number} [retryCount] - Bounded explicit Retry-After attempts.
 * @returns {Promise<IncomingMessage>} Successful streaming response.
 */
export async function openSource(
  target: URL,
  signal: AbortSignal,
  redirectCount = 0,
  headers: Record<string, string> = {},
  access?: SourceAccess,
  retryCount = 0,
): Promise<SourceResponse> {
  const destination = await resolvePublicTarget(target);
  signal.throwIfAborted();
  const transport = target.protocol === TRANSFER.https ? https : http;
  const response = await new Promise<IncomingMessage>(
    /**
     * Connects to the checked address while retaining the original host and TLS identity.
     * @param {Function} resolve - Completes the pending operation.
     * @param {Function} reject - Rejects the pending operation.
     */ (resolve, reject) => {
      const request = transport.get(
        target,
        {
          signal,
          agent: false,
          family: destination.family,
          lookup: (_hostname, _options, callback) => callback(null, destination.address, destination.family),
          headers: {
            'User-Agent': 'LinkDock/2.17',
            'Accept-Encoding': 'identity',
            ...headers,
            ...browserHeaders(access, target),
          },
        },
        resolve,
      );
      request.setTimeout(LIMIT.idleTimeoutMilliseconds, () =>
        request.destroy(Object.assign(new Error('The source timed out.'), { code: 'ETIMEDOUT' })),
      );
      request.on('error', reject);
    },
  );
  const redirectMinimum = 300;
  const redirectMaximum = 399;
  const successMinimum = 200;
  const successMaximum = 299;
  const statusCode = response.statusCode ?? 0;
  if (statusCode >= redirectMinimum && statusCode <= redirectMaximum && response.headers.location) {
    response.destroy();
    if (redirectCount >= LIMIT.maximumRedirects) {
      throw new Error('Too many redirects.');
    }
    return openSource(
      parseTargetUrl(new URL(response.headers.location, target).href),
      signal,
      redirectCount + 1,
      headers,
      access,
      retryCount,
    );
  }
  const rangeUnsatisfiable = 416;
  if (access?.deferRetries && transientHttpStatus(statusCode)) {
    const deadline = sourceRetryAfter(response.headers['retry-after']);
    response.destroy();
    throw new SourceRetryError(statusCode, deadline);
  }
  const cooldownStatuses: number[] = [SOURCE_HTTP.throttled, SOURCE_HTTP.unavailable];
  if (cooldownStatuses.includes(statusCode)) {
    const seconds = retryAfterSeconds(response.headers['retry-after']);
    response.destroy();
    if (seconds !== null && retryCount < BROWSER_ACCESS.maximumRetries) {
      await waitForSource(seconds, signal, access?.onWait);
      return openSource(target, signal, redirectCount, headers, access, retryCount + 1);
    }
    throw new Error('Source cooldown or browser verification required. Wait, then use Browser assistance.');
  }
  if (
    (statusCode < successMinimum || statusCode > successMaximum) &&
    !(headers.Range && statusCode === rangeUnsatisfiable)
  ) {
    response.destroy();
    if (statusCode === SOURCE_HTTP.unauthorized || statusCode === SOURCE_HTTP.forbidden) {
      throw new Error('Source access needs browser verification or login. Use Browser assistance.');
    }
    throw new Error(`The source returned HTTP ${statusCode}.`);
  }
  return Object.assign(response, { sourceUrl: target.href });
}
