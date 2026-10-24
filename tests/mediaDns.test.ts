import https from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { parseMediaDnsAnswer, resolveMediaTarget, MediaDnsResolutionError } from '../server/security/mediaDns';
import { NonPublicTargetError } from '../server/security/target';
import { MEDIA_DNS_MODE } from '../shared/mediaDns';
import { HTTP_STATUS } from '../shared/contracts';
import { loadServerConfig } from '../server/config';

const REDIRECT = 302;
const IPV4 = 4;
const IPV6 = 6;
const CNAME = 5;
const MAXIMUM_BYTES = 65_536;
const TWO_QUERIES = 2;
const NXDOMAIN = 3;
const target = new URL('https://source.example/private/path?token=private-secret');
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Supplies exact DNS JSON while exercising real request options and response validation.
 * @param {(type: number) => unknown} answer - Per-family resolver body.
 * @param {number} status - HTTP response code.
 * @param {string} contentType - Resolver response type.
 * @returns {object} Request spy and observed options.
 */
function resolverFixture(
  answer: (type: number) => unknown,
  status: number = HTTP_STATUS.ok,
  contentType = 'application/dns-json',
) {
  const requests: https.RequestOptions[] = [];
  const get = vi.spyOn(https, 'get').mockImplementation(((
    options: https.RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => {
    requests.push(options);
    const request = new EventEmitter() as ClientRequest;
    queueMicrotask(() => {
      const stream = Object.assign(new PassThrough(), { statusCode: status, headers: { 'content-type': contentType } });
      callback(stream as unknown as IncomingMessage);
      const type = Number(new URL(options.path!, 'https://cloudflare-dns.com').searchParams.get('type'));
      const body = answer(type);
      stream.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
    return request;
  }) as typeof https.get);
  return { get, requests };
}
/** Produces a matching bounded DNS question/answer fixture.
 * @param {number} type - Requested record family.
 * @param {string} address - DNS address record.
 * @returns {object} Resolver response fixture.
 */
function responseFor(type: number, address: string) {
  return {
    Status: 0,
    TC: false,
    Question: [{ name: 'source.example.', type }],
    Answer: [{ name: 'source.example.', type, data: address }],
  };
}

it('pins HTTPS DNS independently of source URL secrets and validates both families', async () => {
  const { requests } = resolverFixture((type) => responseFor(type, type === 1 ? '93.184.216.34' : '2606:4700::1111'));
  await expect(resolveMediaTarget(target, MEDIA_DNS_MODE.cloudflare)).resolves.toEqual({
    address: '93.184.216.34',
    family: IPV4,
  });
  expect(requests).toHaveLength(TWO_QUERIES);
  for (const options of requests) {
    expect(options).toMatchObject({
      hostname: 'cloudflare-dns.com',
      servername: 'cloudflare-dns.com',
      family: IPV4,
      agent: false,
      headers: { Accept: 'application/dns-json' },
    });
    const callback = vi.fn();
    options.lookup!('cloudflare-dns.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '1.1.1.1', IPV4);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(options)).not.toMatch(/private-secret|private\/path|Authorization|Cookie/);
  }
});

it.each(['198.18.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1'])(
  'rejects private/fake DNS address %s even with opt-in HTTPS DNS',
  async (address) => {
    resolverFixture((type) => responseFor(type, type === 1 ? address : '2606:4700::1111'));
    await expect(resolveMediaTarget(target, MEDIA_DNS_MODE.cloudflare)).rejects.toBeInstanceOf(NonPublicTargetError);
  },
);

it('does not accept a public A record when the AAAA answer is private', async () => {
  resolverFixture((type) => responseFor(type, type === 1 ? '93.184.216.34' : '::1'));
  await expect(resolveMediaTarget(target, MEDIA_DNS_MODE.cloudflare)).rejects.toBeInstanceOf(NonPublicTargetError);
});

it('validates public/private IP literals without querying an external resolver', async () => {
  const spy = vi.spyOn(https, 'get');
  await expect(resolveMediaTarget(new URL('https://127.0.0.1/'), MEDIA_DNS_MODE.cloudflare)).rejects.toThrow('blocked');
  await expect(resolveMediaTarget(new URL('https://[2606:4700::1111]/'), MEDIA_DNS_MODE.cloudflare)).resolves.toEqual({
    address: '2606:4700::1111',
    family: IPV6,
  });
  expect(spy).not.toHaveBeenCalled();
});

it('accepts CNAME-linked answers but rejects unrelated records, mismatched questions and malformed replies', () => {
  const reply = {
    ...responseFor(1, '93.184.216.34'),
    Answer: [
      { name: 'source.example.', type: CNAME, data: 'cdn.example.' },
      { name: 'cdn.example.', type: 1, data: '93.184.216.34' },
    ],
  };
  expect(parseMediaDnsAnswer(reply, 'source.example', 1)).toEqual([{ address: '93.184.216.34', family: IPV4 }]);
  for (const body of [
    null,
    {},
    { ...reply, Status: 1 },
    { ...reply, TC: true },
    { ...reply, Question: [{ name: 'wrong.example.', type: 1 }] },
    { ...reply, Answer: [{ name: 'other.example.', type: 1, data: '93.184.216.34' }] },
    { ...reply, Answer: [null] },
    { ...reply, Answer: [{ name: 'source.example.', type: 1, data: 'not-an-ip' }] },
  ]) {
    expect(() => parseMediaDnsAnswer(body, 'source.example', 1)).toThrow(MediaDnsResolutionError);
  }
});

it.each([
  [REDIRECT, 'application/dns-json', '{}'],
  [HTTP_STATUS.ok, 'text/html', '<html>private-body</html>'],
  [HTTP_STATUS.ok, 'application/dns-json', 'private-invalid-json'],
  [HTTP_STATUS.ok, 'application/dns-json', 'x'.repeat(MAXIMUM_BYTES + 1)],
])('fails closed for invalid or redirected resolver responses (%s)', async (status, contentType, body) => {
  resolverFixture(() => body, status, contentType);
  const error = await resolveMediaTarget(target, MEDIA_DNS_MODE.cloudflare).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(MediaDnsResolutionError);
  expect(String(error)).not.toMatch(/private-body|private-invalid|private-secret/);
});

it('treats NXDOMAIN and absent answers as DNS failures without system-DNS fallback', async () => {
  const { get } = resolverFixture((type) => ({ Status: NXDOMAIN, Question: [{ name: 'source.example.', type }] }));
  await expect(resolveMediaTarget(target, MEDIA_DNS_MODE.cloudflare)).rejects.toThrow(MediaDnsResolutionError);
  expect(get).toHaveBeenCalledTimes(TWO_QUERIES);
});

it('loads only documented resolver choices while retaining system DNS by default', () => {
  vi.stubEnv('LINKDOCK_ACCESS_TOKEN', 'test-station-password-at-least-32-characters');
  vi.stubEnv('MEDIA_DNS_MODE', '');
  expect(loadServerConfig().mediaDnsMode).toBe(MEDIA_DNS_MODE.system);
  vi.stubEnv('MEDIA_DNS_MODE', 'cloudflare');
  expect(loadServerConfig().mediaDnsMode).toBe(MEDIA_DNS_MODE.cloudflare);
  vi.stubEnv('MEDIA_DNS_MODE', 'http://private-resolver/');
  expect(() => loadServerConfig()).toThrow('MEDIA_DNS_MODE must be system or cloudflare');
});
