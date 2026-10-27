import http, { type Server } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSource } from '../server/downloads/openSource';
import { resolvePublicTarget } from '../server/security/target';
import { parseCookieJar } from '../server/browserAccess/cookieJar';
import { SourceRetryError } from '../server/downloads/retry';
import { DOWNLOAD_RETRY } from '../shared/downloadRetry';

/**
 * Verifies: ../server/security/target.
 * @param {Function} importOriginal - Loads the original module for a partial mock.
 * @returns {Promise<object>} Deterministic module replacement.
 */
vi.mock('../server/security/target', async (importOriginal) => {
  const original = await importOriginal<typeof import('../server/security/target')>();
  return { ...original, resolvePublicTarget: vi.fn() };
});
const servers: Server[] = [];
const REDIRECT_STATUS = 302;

/**
 * Starts a real local HTTP upstream, reachable only through a mocked DNS validation boundary.
 * @param {http.RequestListener} listener - Simulated upstream behavior.
 * @returns {Promise<URL>} URL with an intentionally nonexistent hostname.
 */
async function createUpstream(listener: http.RequestListener): Promise<URL> {
  const server = http.createServer(listener);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP server.');
  }
  vi.mocked(resolvePublicTarget).mockResolvedValue({ address: '127.0.0.1', family: 4 });
  return new URL(`http://unresolvable-upstream.invalid:${address.port}/file`);
}
afterEach(
  /**
   * Cleans isolated test resources after the case finishes.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    vi.mocked(resolvePublicTarget).mockReset();
  },
);

/**
 * Groups behavior checks: real streaming HTTP transport.
 */
describe('real streaming HTTP transport', () => {
  it('returns a deferred cooldown to the queue after one request instead of sleeping in a worker slot', async () => {
    const throttled = 429;
    const requestedSeconds = 3_600;
    let requests = 0;
    const target = await createUpstream((_request, response) => {
      requests += 1;
      response.writeHead(throttled, { 'Retry-After': String(requestedSeconds) });
      response.end('private-rate-limit-body');
    });
    const before = Date.now();
    const failure = await openSource(
      target,
      new AbortController().signal,
      0,
      {},
      { cookies: [], userAgent: '', deferRetries: true },
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SourceRetryError);
    expect((failure as SourceRetryError).retryAfterAt).toBeGreaterThanOrEqual(
      before + requestedSeconds * DOWNLOAD_RETRY.millisecondsPerSecond,
    );
    expect(String(failure)).not.toContain('private-rate-limit-body');
    expect(requests).toBe(1);
  });
  it('sends only matching imported cookies and browser identity over the pinned transport', async () => {
    const target = await createUpstream((request, response) => {
      expect(request.headers.cookie).toBe('verified=owned');
      expect(request.headers['user-agent']).toBe('Browser/1');
      response.end('file');
    });
    const { cookies } = parseCookieJar(
      '# Netscape HTTP Cookie File\n' +
        'unresolvable-upstream.invalid\tFALSE\t/\tFALSE\t0\tverified\towned\n' +
        'other.example\tFALSE\t/\tFALSE\t0\tother\tnever-send\n',
    );
    const response = await openSource(target, new AbortController().signal, 0, {}, { cookies, userAgent: 'Browser/1' });
    expect(Buffer.concat(await Readable.from(response).toArray()).toString()).toBe('file');
  });

  it('honors Retry-After and retries a real upstream without saving its error body', async () => {
    const throttled = 429;
    const attempts = 2;
    let requests = 0;
    const target = await createUpstream((_request, response) => {
      requests += 1;
      if (requests === 1) {
        response.writeHead(throttled, { 'Retry-After': '0' });
        response.end('wait-page');
      } else {
        response.end('final-file');
      }
    });
    const response = await openSource(target, new AbortController().signal);
    expect(Buffer.concat(await Readable.from(response).toArray()).toString()).toBe('final-file');
    expect(requests).toBe(attempts);
  });

  it('bounds repeated source cooldowns and rejects oversized waits without shortening them', async () => {
    const unavailable = 503;
    const expectedAttempts = 3;
    let requests = 0;
    const target = await createUpstream((_request, response) => {
      requests += 1;
      response.writeHead(unavailable, { 'Retry-After': '0' });
      response.end('wait');
    });
    await expect(openSource(target, new AbortController().signal)).rejects.toThrow('Browser assistance');
    expect(requests).toBe(expectedAttempts);
    const long = await createUpstream((_request, response) => {
      response.writeHead(unavailable, { 'Retry-After': '999999' });
      response.end('wait');
    });
    await expect(openSource(long, new AbortController().signal)).rejects.toThrow('Browser assistance');
  });
  /**
   * Verifies range headers survive the pinned transport and final resource metadata is recorded internally.
   * @returns {Promise<void>} Actual HTTP range response.
   */
  it('sends a single byte range and records the final response URL', async () => {
    const partialStatus = 206;
    const target = await createUpstream((request, response) => {
      expect(request.headers.range).toBe('bytes=3-');
      expect(request.headers['if-range']).toBe('"stable"');
      response.writeHead(partialStatus, { ETag: '"stable"', 'Content-Range': 'bytes 3-4/5' });
      response.end('lo');
    });
    const response = await openSource(target, new AbortController().signal, 0, {
      Range: 'bytes=3-',
      'If-Range': '"stable"',
    });
    expect(response.sourceUrl).toBe(target.href);
    expect(response.statusCode).toBe(partialStatus);
    expect(Buffer.concat(await Readable.from(response).toArray()).toString()).toBe('lo');
  });
  /**
   * Verifies: connects to the validated address while preserving the original Host header.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('connects to the validated address while preserving the original Host header', async () => {
    let receivedHost: string | undefined;
    const target = await createUpstream(
      /**
       * Models the upstream response for this transport scenario.
       * @param {http.IncomingMessage} request - Incoming request.
       * @param {http.ServerResponse} response - HTTP response destination.
       */
      (request, response) => {
        receivedHost = request.headers.host;
        response.end('streamed bytes');
      },
    );
    const response = await openSource(target, new AbortController().signal);
    const receivedChunks = await Readable.from(response).toArray();
    expect(Buffer.concat(receivedChunks).toString()).toBe('streamed bytes');
    expect(receivedHost).toBe(target.host);
  });
  /**
   * Verifies: validates the new destination before following an upstream redirect.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('validates the new destination before following an upstream redirect', async () => {
    const target = await createUpstream(
      /**
       * Models the upstream response for this transport scenario.
       * @param {http.IncomingMessage} _request - Unused incoming request.
       * @param {http.ServerResponse} response - HTTP response destination.
       */
      (_request, response) => {
        response.writeHead(REDIRECT_STATUS, { Location: 'http://127.0.0.1/private' });
        response.end();
      },
    );
    vi.mocked(resolvePublicTarget)
      .mockResolvedValueOnce({ address: '127.0.0.1', family: 4 })
      .mockRejectedValueOnce(new Error('Private destinations are blocked.'));
    await expect(openSource(target, new AbortController().signal)).rejects.toThrow('blocked');
    expect(vi.mocked(resolvePublicTarget).mock.calls.at(-1)?.[0].hostname).toBe('127.0.0.1');
  });
  /**
   * Verifies: does not download an HTTP error response as a successful file.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('does not download an HTTP error response as a successful file', async () => {
    const notFoundStatus = 404;
    const target = await createUpstream(
      /**
       * Models the upstream response for this transport scenario.
       * @param {http.IncomingMessage} _request - Unused incoming request.
       * @param {http.ServerResponse} response - HTTP response destination.
       */
      (_request, response) => {
        response.writeHead(notFoundStatus);
        response.end('missing');
      },
    );
    await expect(openSource(target, new AbortController().signal)).rejects.toThrow('HTTP 404');
  });
});
