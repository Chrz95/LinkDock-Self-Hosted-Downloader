import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import type { ServerConfig } from '../config.js';
import { parseTargetUrl, resolvePublicTarget, NonPublicTargetError } from '../security/target.js';
import { resolveMediaTarget } from '../security/mediaDns.js';
import { browserHeaders, type SourceAccess } from '../browserAccess/headers.js';
import { DIAGNOSTICS, type DiagnosticCheck } from '../../shared/diagnostics.js';
import { LIMIT } from '../constants.js';
import { HTTP_STATUS } from '../../shared/contracts.js';
const RESPONSE_RANGE = { redirectMinimum: 300, redirectMaximum: 399, successMaximum: 299 } as const;

/** Cancels the wait even if the operating system resolver cannot cancel its underlying lookup.
 * @param {Promise<T>} operation - DNS lookup without any socket side effects.
 * @param {AbortSignal} signal - Overall deadline.
 * @returns {Promise<T>} Lookup result or cancellation.
 */
async function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let rejectCancelled: ((reason?: unknown) => void) | undefined;
  const cancelled = new Promise<T>((_resolve, reject) => {
    rejectCancelled = reject;
  });
  /** Rejects the caller's wait without echoing private resolver errors. */
  function abort(): void {
    rejectCancelled?.(signal.reason);
  }
  signal.addEventListener('abort', abort, { once: true });
  try {
    return await Promise.race([operation, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

/** Samples HTML only; binary files are closed at headers and no response body leaves this module.
 * @param {IncomingMessage} response - Bounded source response.
 * @returns {Promise<string>} Small private page prefix, never a diagnostic field.
 */
async function pagePrefix(response: IncomingMessage): Promise<string> {
  if (
    !/^(?:text\/html|application\/xhtml\+xml)\b/iu.test(response.headers['content-type'] ?? '') ||
    (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')
  ) {
    response.destroy();
    return '';
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of response) {
      const remaining = DIAGNOSTICS.maximumPageBytes - bytes;
      const buffer = Buffer.from(chunk).subarray(0, remaining);
      chunks.push(buffer);
      bytes += buffer.length;
      if (bytes >= DIAGNOSTICS.maximumPageBytes) {
        break;
      }
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    response.destroy();
  }
}

/** Probes only the original page, pinning each redirect with the same resolver policy as its worker.
 * @param {string} url - Existing job URL, never arbitrary diagnostic API input.
 * @param {ServerConfig} configuration - DNS selection and station limits.
 * @param {boolean} media - Whether this worker uses media DNS rather than direct-file system DNS.
 * @param {SourceAccess} access - Immutable session; cookies are recomputed for each redirect.
 * @param {AbortSignal} signal - Overall timeout and browser disconnect cancellation.
 * @returns {Promise<DiagnosticCheck[]>} Fixed DNS, transport and source explanations.
 */
export async function inspectPage(
  url: string,
  configuration: ServerConfig,
  media: boolean,
  access: SourceAccess,
  signal: AbortSignal,
): Promise<DiagnosticCheck[]> {
  let stage = 'dns';
  let target: URL;
  const checks: DiagnosticCheck[] = [];
  try {
    target = parseTargetUrl(url);
    for (let redirects = 0; redirects <= LIMIT.maximumRedirects; redirects += 1) {
      stage = 'dns';
      signal.throwIfAborted();
      const destination = await abortable(
        media ? resolveMediaTarget(target, configuration.mediaDnsMode) : resolvePublicTarget(target),
        signal,
      );
      signal.throwIfAborted();
      stage = 'connection';
      const transport = target.protocol === 'https:' ? https : http;
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        const request = transport.get(
          target,
          {
            signal,
            agent: false,
            family: destination.family,
            lookup: (_hostname, _options, callback) => callback(null, destination.address, destination.family),
            headers: {
              'User-Agent': 'LinkDock/2.30',
              'Accept-Encoding': 'identity',
              ...browserHeaders(access, target),
            },
          },
          resolve,
        );
        request.on('error', reject);
      });
      stage = 'source';
      const status = response.statusCode ?? 0;
      if (
        status >= RESPONSE_RANGE.redirectMinimum &&
        status <= RESPONSE_RANGE.redirectMaximum &&
        response.headers.location
      ) {
        response.destroy();
        target = parseTargetUrl(new URL(response.headers.location, target).href);
        continue;
      }
      checks.push(
        {
          id: 'dns',
          label: 'DNS and destination',
          state: 'passed',
          detail: 'All visited destinations passed public-address checks.',
        },
        {
          id: 'connection',
          label: 'Connection',
          state: 'passed',
          detail: 'The station reached the source. HTTPS certificates were verified where used.',
        },
      );
      const prefix = await pagePrefix(response);
      const cloudfront =
        status === HTTP_STATUS.forbidden &&
        /cloudfront/iu.test(prefix) &&
        /the request could not be satisfied|request blocked/iu.test(prefix);
      const challenge = /cf-chl-|id=["']challenge-form["']/iu.test(prefix);
      const passed = status >= HTTP_STATUS.ok && status <= RESPONSE_RANGE.successMaximum && !challenge;
      checks.push({
        id: 'source',
        label: 'Source response',
        state: passed ? 'passed' : 'failed',
        detail: cloudfront
          ? 'HTTP 403: a CloudFront block page was returned. Try another VPN server or compare network routes.'
          : challenge
            ? 'The source returned a browser challenge page. Cookies alone may not resolve this network block.'
            : status === HTTP_STATUS.unauthorized
              ? 'HTTP 401: the source requires authentication. Review the saved session in Settings.'
              : status === HTTP_STATUS.forbidden
                ? 'HTTP 403: the source refused access. Account permissions or the station network may be involved.'
                : status === HTTP_STATUS.tooManyRequests
                  ? 'HTTP 429: the source is limiting requests. Wait before restarting and review request pacing.'
                  : `HTTP ${status}: ${passed ? 'the source responded' : 'the source did not accept this request'}.`,
        action: status === HTTP_STATUS.unauthorized || status === HTTP_STATUS.tooManyRequests ? 'settings' : 'source',
      });
      return checks;
    }
    checks.push({
      id: 'source',
      label: 'Source response',
      state: 'failed',
      detail: 'The source exceeded the redirect limit. Check the original link.',
      action: 'source',
    });
  } catch (error) {
    checks.push({
      id: stage,
      label: stage === 'dns' ? 'DNS and destination' : stage === 'source' ? 'Source response' : 'Connection',
      state: 'failed',
      detail:
        error instanceof NonPublicTargetError
          ? 'DNS returned a private or reserved destination. Check VPN/fake-IP DNS and media DNS settings.'
          : stage === 'dns'
            ? 'The destination could not be resolved safely. Check DNS and station connectivity.'
            : signal.aborted
              ? 'The connection check timed out or was cancelled. Check the station network.'
              : 'The connection or TLS check failed. Check the station network, VPN and source availability.',
      action: 'settings',
    });
  }
  return checks;
}
