import { DEVIANTART } from '../../shared/deviantart.js';
import { DEVIANTART_OAUTH } from '../../shared/deviantartOAuth.js';
import { validateDeviantartCredentials, type DeviantartCredentials } from './validation.js';
import type { DeviantartOAuthApp } from './oauthApp.js';
/**
 * Exchanges a one-use code at a fixed provider endpoint with a bounded body, deadline and no redirects.
 * @param {DeviantartOAuthApp} app - Server-only confidential app credentials.
 * @param {string} code - One-use authorization response.
 * @param {string} verifier - Original PKCE verifier retained solely on the server.
 * @param {string} callbackUrl - Exact redirect URI used for this authorization request.
 * @returns {Promise<DeviantartCredentials>} Newly issued private refresh grant; access tokens are discarded.
 */
export async function exchangeDeviantartCode(
  app: DeviantartOAuthApp,
  code: string,
  verifier: string,
  callbackUrl: string,
): Promise<DeviantartCredentials> {
  const response = await fetch('https://www.deviantart.com/oauth2/token', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(DEVIANTART_OAUTH.requestTimeoutMilliseconds),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: callbackUrl,
    }),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('DeviantArt did not issue an account grant.');
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > DEVIANTART.maximumStateBytes) {
        await reader.cancel();
        throw new Error('DeviantArt returned an invalid account grant.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const value = JSON.parse(Buffer.concat(chunks).toString()) as { refresh_token?: unknown; access_token?: unknown };
  if (typeof value.access_token !== 'string' || !value.access_token) {
    throw new Error('DeviantArt returned an invalid account grant.');
  }
  return validateDeviantartCredentials({ ...app, refreshToken: value.refresh_token });
}
