/** Protected notification API subpaths. */
export const NOTIFICATION_PATH = {
  subscription: '/subscription',
  unsubscribe: '/unsubscribe',
  test: '/test',
  status: '/status',
} as const;
/** Push setup information never exposes private keys or stored browser endpoints. */
export interface PushConfiguration {
  enabled: boolean;
  publicKey: string | null;
  reason: string | null;
}
/** Minimal persisted Web Push subscription; authentication belongs to the station session. */
export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
/** Generic messages avoid disclosing filenames or source URLs on lock screens and push providers. */
export const PUSH_MESSAGE = {
  completed: 'A download is ready on your station.',
  failed: 'A download needs your attention. Open LinkDock for details.',
  test: 'LinkDock alerts are connected to this device.',
} as const;
/** Resource limits for browser registrations and background delivery. */
export const PUSH_LIMIT = {
  maximumDevices: 32,
  sendConcurrency: 2,
  timeoutMilliseconds: 5_000,
  timeToLiveSeconds: 3_600,
  publicKeyBytes: 65,
  privateKeyBytes: 32,
  authenticationBytes: 16,
  maximumSubjectLength: 2_048,
  maximumPublicKeyCharacters: 128,
  maximumAuthCharacters: 32,
  maximumPrivateKeyCharacters: 64,
} as const;
