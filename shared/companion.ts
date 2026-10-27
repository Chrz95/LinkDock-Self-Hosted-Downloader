/** Independent extension connections can queue downloads, but cannot read the library or manage the station. */
export const COMPANION = {
  path: '/api/companions',
  clientPath: '/api/companion',
  maximumConnections: 20,
  maximumStateBytes: 131_072,
  tokenBytes: 32,
  lifetimeMilliseconds: 7_776_000_000,
  requestWindowMilliseconds: 60_000,
  requestsPerWindow: 60,
} as const;
export interface CompanionConnection {
  id: string;
  createdAt: string;
  expiresAt: string;
}
export const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/u;
export const COMPANION_TOKEN = /^ldc_[a-f\d]{64}$/u;
