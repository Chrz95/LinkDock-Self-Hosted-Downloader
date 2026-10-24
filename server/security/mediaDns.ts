import https from 'node:https';
import { isIP } from 'node:net';
import type { LookupAddress } from 'node:dns';
import { MEDIA_DNS_MODE, type MediaDnsMode } from '../../shared/mediaDns.js';
import { isPublicAddress, NonPublicTargetError, resolvePublicTarget } from './target.js';

const DNS = {
  address: '1.1.1.1',
  host: 'cloudflare-dns.com',
  timeout: 8_000,
  maximumBytes: 65_536,
  maximumAnswers: 128,
  ipv4: 4,
  ipv6: 6,
  a: 1,
  aaaa: 28,
  cname: 5,
  nxdomain: 3,
  success: 200,
} as const;
/** Fixed, non-secret resolver failure; no provider body or hostname enters job history. */
export class MediaDnsResolutionError extends Error {
  /** Creates an actionable message for the selected resolution path. */
  constructor() {
    super('Media DNS resolution failed. Check connectivity and MEDIA_DNS_MODE in your container settings.');
    this.name = 'MediaDnsResolutionError';
  }
}
/** Validates DNS JSON, including the question and CNAME chain before accepting address records.
 * @param {unknown} input - Bounded resolver JSON.
 * @param {string} hostname - Exact requested ASCII host.
 * @param {number} type - Requested A or AAAA record.
 * @returns {LookupAddress[]} Untrusted addresses, still subject to public-address checks.
 */
export function parseMediaDnsAnswer(input: unknown, hostname: string, type: number): LookupAddress[] {
  const value = input as {
    Status?: number;
    TC?: boolean;
    Question?: { name?: string; type?: number }[];
    Answer?: { name?: string; type?: number; data?: string }[];
  } | null;
  const expected = hostname.toLowerCase().replace(/\.$/u, '');
  if (
    !value ||
    value.TC ||
    ![0, DNS.nxdomain].includes(value.Status!) ||
    !Array.isArray(value.Question) ||
    value.Question.length !== 1 ||
    typeof value.Question[0]?.name !== 'string' ||
    value.Question[0]?.name?.toLowerCase().replace(/\.$/u, '') !== expected ||
    value.Question[0]?.type !== type ||
    (value.Answer !== undefined && !Array.isArray(value.Answer)) ||
    (value.Answer?.length ?? 0) > DNS.maximumAnswers
  ) {
    throw new MediaDnsResolutionError();
  }
  const answers = value.Answer ?? [];
  if (
    answers.some((answer) => !answer || typeof answer !== 'object' || Array.isArray(answer)) ||
    (value.Status === DNS.nxdomain && answers.length)
  ) {
    throw new MediaDnsResolutionError();
  }
  const names = new Set([expected]);
  for (let pass = 0; pass < answers.length; pass += 1) {
    for (const answer of answers) {
      if (
        answer.type === DNS.cname &&
        typeof answer.name === 'string' &&
        typeof answer.data === 'string' &&
        names.has(answer.name.toLowerCase().replace(/\.$/u, ''))
      ) {
        names.add(answer.data.toLowerCase().replace(/\.$/u, ''));
      }
    }
  }
  return answers
    .filter((answer) => answer.type === DNS.a || answer.type === DNS.aaaa)
    .map((answer) => {
      const family = answer.type === DNS.a ? DNS.ipv4 : DNS.ipv6;
      if (
        typeof answer.name !== 'string' ||
        !names.has(answer.name.toLowerCase().replace(/\.$/u, '')) ||
        typeof answer.data !== 'string' ||
        isIP(answer.data) !== family
      ) {
        throw new MediaDnsResolutionError();
      }
      return { address: answer.data, family };
    });
}
/** Sends a bounded DNS-only HTTPS request to a pinned resolver address with normal TLS verification.
 * @param {string} hostname - Requested source host; never includes URL paths or credentials.
 * @param {number} type - A or AAAA query.
 * @returns {Promise<LookupAddress[]>} Validated resolver response, without redirects or system-DNS fallback.
 */
function queryMediaDns(hostname: string, type: number): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => {
    const failure = new MediaDnsResolutionError();
    const request = https.get(
      {
        hostname: DNS.host,
        servername: DNS.host,
        family: DNS.ipv4,
        agent: false,
        path: `/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(DNS.timeout),
        lookup: (_hostname, _options, callback) => callback(null, DNS.address, DNS.ipv4),
      },
      (response) => {
        if (
          response.statusCode !== DNS.success ||
          !response.headers['content-type']?.startsWith('application/dns-json')
        ) {
          response.destroy();
          reject(failure);
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > DNS.maximumBytes) {
            response.destroy();
            reject(failure);
          } else {
            chunks.push(chunk);
          }
        });
        response.on('error', () => reject(failure));
        response.on('aborted', () => reject(failure));
        response.on('end', () => {
          try {
            resolve(parseMediaDnsAnswer(JSON.parse(Buffer.concat(chunks).toString('utf8')), hostname, type));
          } catch {
            reject(failure);
          }
        });
      },
    );
    request.on('error', () => reject(failure));
  });
}
/** Resolves media hosts through the explicitly selected DNS source, then pins a checked public IP.
 * @param {URL} target - Validated media destination.
 * @param {MediaDnsMode} [mode] - Operating-system DNS or opt-in Cloudflare HTTPS DNS.
 * @returns {Promise<LookupAddress>} Checked connection address; private and mixed answers are always rejected.
 */
export async function resolveMediaTarget(target: URL, mode: MediaDnsMode = MEDIA_DNS_MODE.system) {
  try {
    if (mode === MEDIA_DNS_MODE.system) {
      return await resolvePublicTarget(target);
    }
    if (mode !== MEDIA_DNS_MODE.cloudflare) {
      throw new MediaDnsResolutionError();
    }
    const hostname = target.hostname.replace(/^\[|\]$/gu, '');
    const literalFamily = isIP(hostname);
    const addresses = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : (await Promise.all([queryMediaDns(hostname, DNS.a), queryMediaDns(hostname, DNS.aaaa)])).flat();
    if (!addresses.length) {
      throw new MediaDnsResolutionError();
    }
    if (addresses.some((entry) => !isPublicAddress(entry.address))) {
      throw new NonPublicTargetError();
    }
    return addresses.find((entry) => entry.family === DNS.ipv4) ?? addresses[0]!;
  } catch (error) {
    throw error instanceof NonPublicTargetError ? error : new MediaDnsResolutionError();
  }
}
