import type { Request } from 'express';
import { DEVIANTART_OAUTH, type DeviantartOAuthSnapshot } from '../../shared/deviantartOAuth.js';
import type { ServerConfig } from '../config.js';
/** A fixed recovery hint distinguishes a provider homepage from the one-use callback response. */
export class DeviantartHomepageError extends Error {
  /** Creates an application-authored error without retaining the submitted URL or provider query. */
  constructor() {
    super(DEVIANTART_OAUTH.homepageMessage);
  }
}
/**
 * Uses an HTTPS callback for every provider request, with a one-time copy return for HTTP-only stations.
 * @param {ServerConfig} configuration - Station's optional canonical origin.
 * @param {Request} request - Current browser-facing host when no origin is configured.
 * @returns {Pick<DeviantartOAuthSnapshot, 'callbackUrl' | 'returnMode'>} Safe provider redirect and return method.
 */
export function deviantartReturnMode(
  configuration: ServerConfig,
  request: Request,
): Pick<DeviantartOAuthSnapshot, 'callbackUrl' | 'returnMode'> {
  const origin = configuration.publicOrigin ?? `${request.protocol}://${request.get('host')}`;
  const direct = new URL(origin).protocol === 'https:';
  return {
    callbackUrl: direct ? new URL(DEVIANTART_OAUTH.callback, origin).href : DEVIANTART_OAUTH.landing,
    returnMode: direct ? ('direct' as const) : ('copy' as const),
  };
}
/**
 * Parses an authorization response as data; submitted URLs are never fetched or used as exchange destinations.
 * @param {unknown} input - Owner-pasted full HTTPS landing or redirected localhost address.
 * @returns {{state: string; code: string | null; error: string | null}} Bounded OAuth response parameters.
 */
export function parseDeviantartReturn(input: unknown) {
  if (typeof input !== 'string' || input.length > DEVIANTART_OAUTH.maximumReturnCharacters) {
    throw new Error('Paste the complete authorization response URL.');
  }
  const url = new URL(input.trim());
  if (url.hostname === 'www.deviantart.com' || url.hostname === 'deviantart.com') {
    throw new DeviantartHomepageError();
  }
  const destination = `${url.origin}${url.pathname}`;
  if (
    url.username ||
    url.password ||
    url.hash ||
    ![DEVIANTART_OAUTH.landing, DEVIANTART_OAUTH.loopbackReturn].some((address) => address === destination) ||
    url.searchParams.getAll('state').length !== 1 ||
    url.searchParams.getAll('code').length > 1 ||
    url.searchParams.getAll('error').length > 1 ||
    Boolean(url.searchParams.get('code')) === Boolean(url.searchParams.get('error'))
  ) {
    throw new Error('Paste the complete authorization response URL.');
  }
  const state = url.searchParams.get('state')!;
  if (!/^[A-Za-z0-9_-]+$/u.test(state)) {
    throw new Error('The authorization response is invalid.');
  }
  return { state, code: url.searchParams.get('code'), error: url.searchParams.get('error') };
}
