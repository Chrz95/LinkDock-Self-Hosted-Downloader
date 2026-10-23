import { parseCookieJar, type BrowserCookie } from './cookieJar.js';
import type { BrowserAccessState } from './store.js';

/** Maps supported login subdomains to a single refreshable session.
 * @param {string} domain - Validated cookie hostname.
 * @returns {string} Session scope.
 */
export function sessionDomain(domain: string): string {
  return ['instagram.com', 'deviantart.com'].find((site) => domain === site || domain.endsWith(`.${site}`)) ?? domain;
}
/** Serializes validated rows without exposing them in metadata.
 * @param {BrowserCookie[]} cookies - Private cookie rows.
 * @returns {string | null} Bounded Netscape jar, or no imported session.
 */
export function serializeCookies(cookies: BrowserCookie[]): string | null {
  if (!cookies.length) {
    return null;
  }
  const lines = cookies.map((cookie) =>
    [
      `${cookie.subdomains ? '.' : ''}${cookie.domain}`,
      cookie.subdomains ? 'TRUE' : 'FALSE',
      cookie.path,
      cookie.secure ? 'TRUE' : 'FALSE',
      cookie.expires,
      cookie.name,
      cookie.value,
    ].join('\t'),
  );
  return parseCookieJar(`# Netscape HTTP Cookie File\n${lines.join('\n')}\n`).text;
}
/** Replaces only imported sites, keeping all other sessions and their browser identities.
 * @param {BrowserAccessState} state - Mutable private state.
 * @param {unknown} input - Validated at the boundary before mutation.
 * @param {string} userAgent - Browser identity for these sites.
 */
export function importSessions(state: BrowserAccessState, input: unknown, userAgent: string): void {
  const incoming = parseCookieJar(input);
  const sites = new Set(incoming.cookies.map((cookie) => sessionDomain(cookie.domain)));
  const existing = state.cookies ? parseCookieJar(state.cookies).cookies : [];
  const identities = { ...state.userAgents };
  for (const cookie of existing) {
    identities[sessionDomain(cookie.domain)] ??= state.userAgent;
  }
  for (const site of sites) {
    identities[site] = userAgent;
  }
  state.cookies = serializeCookies([
    ...existing.filter((cookie) => !sites.has(sessionDomain(cookie.domain))),
    ...incoming.cookies,
  ]);
  state.userAgents = identities;
  state.userAgent = '';
}
/** Removes one site's entire session without affecting other sites.
 * @param {BrowserAccessState} state - Mutable private state.
 * @param {unknown} domain - Public session identifier.
 */
export function removeSession(state: BrowserAccessState, domain: unknown): void {
  const cookies = state.cookies ? parseCookieJar(state.cookies).cookies : [];
  if (typeof domain !== 'string' || !cookies.some((cookie) => sessionDomain(cookie.domain) === domain)) {
    throw new Error('Choose a saved site session.');
  }
  state.cookies = serializeCookies(cookies.filter((cookie) => sessionDomain(cookie.domain) !== domain));
  if (state.userAgents) {
    delete state.userAgents[domain];
  }
}
/** Picks the identity saved for the source, preserving legacy state support.
 * @param {BrowserAccessState} state - Private state snapshot.
 * @param {string} url - Download source URL.
 * @returns {string} Source-specific browser identity.
 */
export function sessionUserAgent(state: BrowserAccessState, url: string): string {
  const host = new URL(url).hostname;
  const domain = Object.keys(state.userAgents ?? {})
    .sort((a, b) => b.length - a.length)
    .find((site) => host === site || host.endsWith(`.${site}`));
  return domain ? state.userAgents![domain]! : state.userAgent;
}

/** Selects imported credentials for the source; unrelated imports do not mask the mounted fallback.
 * @param {BrowserAccessState} state - Private session snapshot.
 * @param {string} url - Download source URL.
 * @returns {string | null} Source session only, or mounted fallback selection.
 */
export function cookiesForSource(state: BrowserAccessState, url: string): string | null {
  const host = new URL(url).hostname;
  return serializeCookies(
    (state.cookies ? parseCookieJar(state.cookies).cookies : []).filter((cookie) => {
      const domain = sessionDomain(cookie.domain);
      return host === domain || host.endsWith(`.${domain}`);
    }),
  );
}
