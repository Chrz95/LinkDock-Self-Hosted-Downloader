import type { MediaFailure } from './mediaFailures.js';
import type { MediaDnsMode } from './mediaDns.js';
import type { SourceType } from './sources.js';

/** Reports contain only fixed explanations, capability flags and numeric HTTP statuses. */
export interface DiagnosticCheck {
  id: string;
  label: string;
  state: 'passed' | 'failed' | 'info' | 'skipped';
  detail: string;
  action?: 'settings' | 'source';
}
export interface DownloadDiagnostic {
  diagnostic: 'LD-DOWNLOAD-1';
  checkedAt: string;
  sourceType: SourceType;
  dnsMode: MediaDnsMode;
  previousFailure: MediaFailure | null;
  checks: DiagnosticCheck[];
}
export const DIAGNOSTICS = {
  path: '/diagnostic',
  timeoutMilliseconds: 12_000,
  cacheMilliseconds: 60_000,
  maximumCachedReports: 20,
  maximumPageBytes: 65_536,
  maximumCookieBytes: 262_144,
} as const;
