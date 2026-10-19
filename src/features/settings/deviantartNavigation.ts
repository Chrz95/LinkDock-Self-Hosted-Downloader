/**
 * Restricts account navigation to the provider's fixed HTTPS authorization endpoint.
 * @param {string} address - Same-origin API's authorization response.
 */
export function navigateDeviantartAuthorization(address: string): void {
  const url = new URL(address);
  if (url.origin !== 'https://www.deviantart.com' || url.pathname !== '/oauth2/authorize') {
    throw new Error('The authorization address was rejected.');
  }
  window.location.assign(url.href);
}
