import { DEVIANTART_OAUTH } from '../../../shared/deviantartOAuth';
/** Required, single-valued OAuth fields prevent a bare provider URL from being treated as a sign-in request. */
const REQUIRED = [
  'client_id',
  'response_type',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'view',
] as const;
const INVALID_LINK = 'The authorization link is incomplete or invalid. Generate a new sign-in link.';
/**
 * Restricts account links to the provider's fixed HTTPS authorization endpoint.
 * @param {string} address - Same-origin API's authorization response.
 * @returns {string} Validated URL for direct navigation or a user-activated new-tab link.
 */
export function deviantartAuthorizationAddress(address: string): string {
  const url = parseAddress(address);
  const parameters = url.searchParams;
  if (
    address.length > DEVIANTART_OAUTH.maximumReturnCharacters ||
    url.username ||
    url.password ||
    url.hash ||
    url.origin !== 'https://www.deviantart.com' ||
    url.pathname !== '/oauth2/authorize' ||
    REQUIRED.some((key) => parameters.getAll(key).length !== 1) ||
    !/^\d+$/u.test(parameters.get('client_id') ?? '') ||
    parameters.get('response_type') !== 'code' ||
    parameters.get('scope') !== 'browse' ||
    parameters.get('view') !== 'login' ||
    parameters.get('code_challenge_method') !== 'S256' ||
    !validProof(parameters.get('state')) ||
    !validProof(parameters.get('code_challenge')) ||
    ['client_secret', 'code_verifier', 'access_token', 'refresh_token', 'code'].some((key) => parameters.has(key))
  ) {
    throw new Error(INVALID_LINK);
  }
  const redirect = parseAddress(parameters.get('redirect_uri')!);
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || redirect.search) {
    throw new Error('The authorization callback must be an HTTPS address. Check the app setup.');
  }
  return url.href;
}
/**
 * Converts malformed links to a fixed message rather than echoing URL contents from a browser parser error.
 * @param {string} address - Provider request or callback address.
 * @returns {URL} Parsed URL.
 */
function parseAddress(address: string): URL {
  try {
    return new URL(address);
  } catch {
    throw new Error(INVALID_LINK);
  }
}
/**
 * Accepts only the fixed-length URL-safe state/challenge emitted by the station's generator.
 * @param {string | null} value - One generated public proof field.
 * @returns {boolean} Whether the proof is complete.
 */
function validProof(value: string | null): boolean {
  return Boolean(value && value.length === DEVIANTART_OAUTH.proofCharacters && /^[A-Za-z0-9_-]+$/u.test(value));
}
/**
 * Navigates HTTPS stations directly to the provider's sign-in page.
 * @param {string} address - Same-origin API's authorization response.
 */
export function navigateDeviantartAuthorization(address: string): void {
  window.location.assign(deviantartAuthorizationAddress(address));
}
