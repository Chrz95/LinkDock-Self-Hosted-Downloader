import http from 'node:http';
import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { inspectPage } from '../server/diagnostics/page';
import { resolvePublicTarget, NonPublicTargetError } from '../server/security/target';
import { resolveMediaTarget } from '../server/security/mediaDns';
import { parseCookieJar } from '../server/browserAccess/cookieJar';
import type { ServerConfig } from '../server/config';

vi.mock('../server/security/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/security/target')>()),
  resolvePublicTarget: vi.fn(),
}));
vi.mock('../server/security/mediaDns', () => ({ resolveMediaTarget: vi.fn() }));
const servers: http.Server[] = [];
const configuration = { mediaDnsMode: 'cloudflare' } as ServerConfig;
const access = { cookies: [], userAgent: '' };
const forbidden = 403;
const redirect = 302;
const success = 200;

/** Redirects only the final socket to a local fixture after real request URL validation.
 * @param {http.RequestListener} listener - Simulated source.
 * @returns {Promise<void>} Fixture transport installed.
 */
async function upstream(listener: http.RequestListener): Promise<void> {
  const server = http.createServer(listener);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Missing fixture address.');
  }
  const { get } = http;
  const ipv4 = 4;
  vi.spyOn(http, 'get').mockImplementation((...args: unknown[]) => {
    const [url, options, callback] = args as [URL, http.RequestOptions, (response: http.IncomingMessage) => void];
    return get(
      url,
      { ...options, port: address.port, lookup: (_hostname, _options, complete) => complete(null, '127.0.0.1', ipv4) },
      callback,
    );
  });
  vi.mocked(resolvePublicTarget).mockResolvedValue({ address: '8.8.8.8', family: 4 });
  vi.mocked(resolveMediaTarget).mockResolvedValue({ address: '8.8.8.8', family: 4 });
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  vi.mocked(resolvePublicTarget).mockReset();
  vi.mocked(resolveMediaTarget).mockReset();
});

it('reports a real CloudFront 403 using media DNS without exposing source, body or cookies', async () => {
  await upstream((request, response) => {
    expect(request.headers.cookie).toBe('auth=private-cookie');
    response.writeHead(forbidden, { 'Content-Type': 'text/html' });
    response.end('The request could not be satisfied. CloudFront. private-body');
  });
  const { cookies } = parseCookieJar(
    '# Netscape HTTP Cookie File\nsource.example\tFALSE\t/\tFALSE\t0\tauth\tprivate-cookie\n',
  );
  const checks = await inspectPage(
    'http://source.example/item?secret=private-value',
    configuration,
    true,
    { cookies, userAgent: 'Browser/1' },
    new AbortController().signal,
  );
  expect(resolveMediaTarget).toHaveBeenCalledWith(expect.any(URL), 'cloudflare');
  expect(checks.find((check) => check.id === 'source')).toMatchObject({
    state: 'failed',
    detail: expect.stringContaining('CloudFront'),
  });
  expect(JSON.stringify(checks)).not.toMatch(/private-|source\.example/);
});

it('does not mistake incidental captcha text for a blocked successful page', async () => {
  await upstream((_request, response) => {
    response.writeHead(success, { 'Content-Type': 'text/html' });
    response.end('<html>captcha-library.js artwork UUID</html>');
  });
  const checks = await inspectPage(
    'http://source.example/item',
    configuration,
    false,
    access,
    new AbortController().signal,
  );
  expect(resolvePublicTarget).toHaveBeenCalledOnce();
  expect(resolveMediaTarget).not.toHaveBeenCalled();
  expect(checks.find((check) => check.id === 'source')?.state).toBe('passed');
});

it('validates every redirect and never sends the old origin cookies to the new origin', async () => {
  const seen: (string | undefined)[] = [];
  await upstream((request, response) => {
    seen.push(request.headers.cookie);
    if (request.headers.host?.startsWith('source.example')) {
      response.writeHead(redirect, { Location: 'http://other.example/file' }).end();
    } else {
      response.end('binary data');
    }
  });
  const { cookies } = parseCookieJar('# Netscape HTTP Cookie File\nsource.example\tFALSE\t/\tFALSE\t0\tauth\tsecret\n');
  const checks = await inspectPage(
    'http://source.example/item',
    configuration,
    false,
    { cookies, userAgent: '' },
    new AbortController().signal,
  );
  expect(seen).toEqual(['auth=secret', undefined]);
  expect(resolvePublicTarget).toHaveBeenCalledTimes(seen.length);
  expect(checks.find((check) => check.id === 'source')?.state).toBe('passed');
});

it('stops a redirect to a non-public destination before opening its socket', async () => {
  let requests = 0;
  await upstream((_request, response) => {
    requests += 1;
    response.writeHead(redirect, { Location: 'http://127.0.0.1/private' }).end();
  });
  vi.mocked(resolveMediaTarget)
    .mockResolvedValueOnce({ address: '8.8.8.8', family: 4 })
    .mockRejectedValueOnce(new NonPublicTargetError());
  const checks = await inspectPage(
    'http://source.example/item',
    configuration,
    true,
    access,
    new AbortController().signal,
  );
  expect(requests).toBe(1);
  expect(checks).toEqual([
    expect.objectContaining({ id: 'dns', state: 'failed', detail: expect.stringContaining('private or reserved') }),
  ]);
});

it('bounds HTML reads and stops an endless response after collecting its prefix', async () => {
  let closed = false;
  await upstream((_request, response) => {
    response.writeHead(success, { 'Content-Type': 'text/html' });
    const oversizedPage = 100_000;
    response.write('a'.repeat(oversizedPage));
    response.on('close', () => {
      closed = true;
    });
  });
  const checks = await inspectPage(
    'http://source.example/item',
    configuration,
    false,
    access,
    new AbortController().signal,
  );
  expect(checks.find((check) => check.id === 'source')?.state).toBe('passed');
  await vi.waitFor(() => expect(closed).toBe(true));
});

it('cancels a stalled DNS wait without waiting for the resolver or starting a connection', async () => {
  vi.mocked(resolveMediaTarget).mockImplementation(() => new Promise(() => undefined));
  const get = vi.spyOn(http, 'get');
  const controller = new AbortController();
  const result = inspectPage('http://source.example/item', configuration, true, access, controller.signal);
  controller.abort();
  expect(await result).toEqual([expect.objectContaining({ id: 'dns', state: 'failed' })]);
  expect(get).not.toHaveBeenCalled();
});
