/** Browser handoff limits; cookies stay in private server storage and never appear in snapshots. */
export const BROWSER_ACCESS = {
  path: '/api/browser-access',
  maximumCookieBytes: 262_144,
  maximumCookies: 4_000,
  maximumUserAgent: 512,
  maximumDelaySeconds: 60,
  maximumWaitSeconds: 120,
  maximumRetries: 2,
  millisecondsPerSecond: 1_000,
} as const;
export const BROWSER_ACTION = { import: 'import', clear: 'clear', settings: 'settings' } as const;
export interface BrowserAccessSnapshot {
  hasCookies: boolean;
  cookieCount: number;
  domainCount: number;
  hasUserAgent: boolean;
  delaySeconds: number;
  updatedAt: string | null;
}
