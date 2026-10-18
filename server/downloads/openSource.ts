import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { LIMIT, TRANSFER } from '../constants.js';
import { parseTargetUrl, resolvePublicTarget } from '../security/target.js';

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
 * @returns {Promise<IncomingMessage>} Successful streaming response.
 */
export async function openSource(
  target: URL,
  signal: AbortSignal,
  redirectCount = 0,
  headers: Record<string, string> = {},
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
          headers: { 'User-Agent': 'LinkDock/2.2', 'Accept-Encoding': 'identity', ...headers },
        },
        resolve,
      );
      request.setTimeout(LIMIT.idleTimeoutMilliseconds, () => request.destroy(new Error('The source timed out.')));
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
    );
  }
  const rangeUnsatisfiable = 416;
  if (
    (statusCode < successMinimum || statusCode > successMaximum) &&
    !(headers.Range && statusCode === rangeUnsatisfiable)
  ) {
    response.destroy();
    throw new Error(`The source returned HTTP ${statusCode}.`);
  }
  return Object.assign(response, { sourceUrl: target.href });
}
