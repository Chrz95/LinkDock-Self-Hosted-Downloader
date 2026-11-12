import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { LIMIT, TRANSFER } from '../constants.js';

/** Safe error type distinguishes a DNS policy rejection from a source-site response. */
export class NonPublicTargetError extends Error {
  /** Builds a non-secret explanation without including hostnames or DNS addresses. */
  constructor() {
    super('Download blocked: DNS returned a private or reserved address. Check VPN, fake-IP or DNS settings.');
    this.name = 'NonPublicTargetError';
  }
}

/**
 * Rejects local, multicast, reserved and mapped-private addresses.
 * @param {string} address - DNS result or IP literal.
 * @returns {boolean} Whether the address is globally routable.
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }
  const parsedAddress = ipaddr.process(address);
  return parsedAddress.range() === 'unicast';
}

/**
 * Parses a public HTTP(S) target and applies the caller's port policy.
 * @param {unknown} value - User-submitted URL.
 * @param {object} [options] - Opt-in to custom ports for TLS-verified download requests.
 * @returns {URL} A normalized HTTP or HTTPS URL.
 */
export function parseTargetUrl(value: unknown, { allowCustomHttpsPort = false } = {}): URL {
  if (typeof value !== 'string' || value.length > LIMIT.maximumUrlLength) {
    throw new Error('Enter a valid HTTP or HTTPS file link.');
  }
  const target = new URL(value);
  if ((target.protocol !== TRANSFER.http && target.protocol !== TRANSFER.https) || target.username || target.password) {
    throw new Error('Only HTTP/HTTPS links without embedded credentials are supported.');
  }
  if (target.port && (target.protocol === TRANSFER.http || !allowCustomHttpsPort || target.port === '0')) {
    throw new Error(
      allowCustomHttpsPort ? 'Custom ports require HTTPS and a nonzero port.' : 'Use a standard HTTP or HTTPS port.',
    );
  }
  target.hash = '';
  return target;
}

/**
 * Resolves and checks all results before pinning one address for this connection.
 * @param {URL} target - Parsed destination, including a validated scheme.
 * @returns {Promise<{address: string; family: number}>} The address to connect to without a second DNS lookup.
 */
export async function resolvePublicTarget(target: URL): Promise<{ address: string; family: number }> {
  const hostname = target.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new NonPublicTargetError();
  }
  const [firstAddress] = addresses;
  if (!firstAddress) {
    throw new Error('The host did not resolve to an address.');
  }
  return firstAddress;
}
