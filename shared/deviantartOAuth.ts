/** First-party account connection; refresh tokens never cross this browser-facing contract. */
export const DEVIANTART_OAUTH = {
  path: '/api/deviantart/oauth',
  callback: '/api/deviantart/oauth/callback',
  resultParameter: 'deviantart',
  lifetimeMilliseconds: 600_000,
  requestTimeoutMilliseconds: 30_000,
  maximumPending: 8,
  randomBytes: 32,
  verifierBytes: 48,
  cookie: 'linkdock_deviantart_oauth',
  redirectStatus: 303,
} as const;
export interface DeviantartOAuthSnapshot {
  configured: boolean;
  callbackUrl: string;
}
/** Fixed outcome text keeps authorization codes and provider diagnostics out of the page and history. */
export const DEVIANTART_OAUTH_RESULT = {
  connected: 'DeviantArt connected. Refresh tokens are managed automatically.',
  denied: 'DeviantArt sign-in was canceled. Your existing account is unchanged.',
  expired: 'This sign-in expired or belongs to another browser. Start a new connection.',
  busy: 'Pause DeviantArt downloads, then connect again. Your existing account is unchanged.',
  failed: 'DeviantArt could not be connected. Check the app setup and try again.',
} as const;
export type DeviantartOAuthResult = keyof typeof DEVIANTART_OAUTH_RESULT;
