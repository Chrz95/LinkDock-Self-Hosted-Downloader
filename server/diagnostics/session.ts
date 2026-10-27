import { lstatSync, readFileSync } from 'node:fs';
import { BrowserAccessStore } from '../browserAccess/store.js';
import { cookiesForSource } from '../browserAccess/sessions.js';
import { parseCookieJar, cookieHeader } from '../browserAccess/cookieJar.js';
import { sourceAccess } from '../browserAccess/headers.js';
import { DeviantartStore } from '../deviantart/store.js';
import type { ServerConfig } from '../config.js';
import type { DownloadJob } from '../../shared/contracts.js';
import { SOURCE_TYPE } from '../../shared/sources.js';
import { DIAGNOSTICS, type DiagnosticCheck } from '../../shared/diagnostics.js';

/** Reads saved setup without updating cookies, refreshing OAuth or opening a provider API session.
 * @param {DownloadJob} job - Existing failed source.
 * @param {ServerConfig} configuration - Private station paths.
 * @returns {object} Private scoped request access and a non-secret setup check.
 */
export function inspectSession(job: DownloadJob, configuration: ServerConfig) {
  const state = new BrowserAccessStore(configuration.dataDirectory).read();
  const access = sourceAccess(state, () => undefined);
  if (job.sourceType !== SOURCE_TYPE.direct && job.sourceType !== undefined) {
    const imported = cookiesForSource(state, job.url);
    if (imported) {
      access.cookies = parseCookieJar(imported).cookies;
    } else if (configuration.mediaCookiesFile) {
      const information = lstatSync(configuration.mediaCookiesFile);
      if (!information.isFile() || information.isSymbolicLink() || information.size > DIAGNOSTICS.maximumCookieBytes) {
        throw new Error('Invalid cookie file.');
      }
      access.cookies = parseCookieJar(readFileSync(configuration.mediaCookiesFile, 'utf8')).cookies;
    } else {
      access.cookies = [];
    }
  }
  const hasCookies = Boolean(cookieHeader(access.cookies, new URL(job.url)));
  const hasAccount =
    job.sourceType === SOURCE_TYPE.deviantart
      ? Boolean(new DeviantartStore(configuration.dataDirectory).read().account)
      : false;
  const check: DiagnosticCheck = {
    id: 'session',
    label: 'Saved account access',
    state: 'info',
    detail:
      `${hasCookies ? 'Matching unexpired cookies are saved.' : 'No matching unexpired cookies are saved.'} ` +
      (job.sourceType === SOURCE_TYPE.deviantart
        ? `${hasAccount ? 'DeviantArt authorization is saved.' : 'No DeviantArt authorization is saved.'} `
        : '') +
      'This checks saved setup; account permissions and API access are not tested.',
    action: 'settings',
  };
  return { access, check };
}
