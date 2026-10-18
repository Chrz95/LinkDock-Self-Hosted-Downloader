/** Protected notification API subpaths. */
export const NOTIFICATION_PATH = {
  subscription: '/subscription',
  unsubscribe: '/unsubscribe',
  test: '/test',
  status: '/status',
  outbox: '/outbox',
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

/** Finite generic categories are coalesced separately for each registered browser. */
export type TerminalAlertKind = Exclude<keyof typeof PUSH_MESSAGE, 'test'>;
/** Retry state is bounded in count, bytes, age, attempts and scheduling frequency. */
const TERMINAL_ALERT_CATEGORIES = 2;
/** Limits remain independent of the number of completed downloads. */
export const OUTBOX_LIMIT = {
  maximumEntries: PUSH_LIMIT.maximumDevices * TERMINAL_ALERT_CATEGORIES,
  maximumBytes: 65_536,
  maximumAttempts: 6,
  maximumAgeMilliseconds: 3_600_000,
  baseRetryMilliseconds: 30_000,
  maximumRetryMilliseconds: 600_000,
  sweepMilliseconds: 30_000,
  backoffMultiplier: 2,
  millisecondsPerSecond: 1_000,
} as const;
/** Private status exposes counts and times, never registrations, fingerprints, keys or alert payloads. */
export interface AlertDeliveryStatus {
  available: boolean;
  pending: number;
  retrying: number;
  sending: number;
  nextAttemptAt: string | null;
  reason: string | null;
}
