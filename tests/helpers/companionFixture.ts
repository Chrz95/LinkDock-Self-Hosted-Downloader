import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

export interface CompanionApi {
  downloadRequest: (
    value: string,
    source?: string,
    quality?: string,
  ) => { url: string; sourceType: string; quality: string };
  submitDownloadToStation: (origin: string, request: object) => Promise<{ ok: boolean; message: string }>;
  identifyStation: (origin: string) => Promise<{ ok: boolean; message: string }>;
  stationOrigin: (value: string) => string;
  stationPattern: (origin: string) => string;
  findStationTab: (station: object) => Promise<{ id: number; url: string } | undefined>;
  connectStation: (value: string, incognito: boolean) => Promise<{ ok: boolean; station?: object }>;
  pairedRequest: (station: object, operation: string, request?: object) => Promise<{ ok: boolean; message: string }>;
  forgetStation: (station: object) => Promise<{ ok: boolean; message: string }>;
}
/** Loads the actual shipped scripts, including serialized-injection functions without hidden closure dependencies.
 * @param {Record<string, unknown>} globals - Explicit browser fixtures only.
 * @returns {CompanionApi} Actual companion operations.
 */
export function loadCompanion(globals: Record<string, unknown> = {}): CompanionApi {
  const source = ['transfer.js', 'station.js', 'download.js', 'paired.js', 'session.js']
    .map((name) => readFileSync(`browser-connector/${name}`, 'utf8'))
    .join('\n');
  return runInNewContext(`${source}; ({...LinkDockCompanion, identifyStation});`, {
    URL,
    AbortSignal,
    ...globals,
  }) as CompanionApi;
}
