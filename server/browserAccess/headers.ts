import type { BrowserAccessState } from './store.js';
import { cookieHeader, parseCookieJar, type BrowserCookie } from './cookieJar.js';

export interface SourceAccess {
  cookies: BrowserCookie[];
  userAgent: string;
  onWait?: (seconds: number) => void;
}
/**
 * Prepares one immutable session snapshot for an entire transfer and its redirects.
 * @param {BrowserAccessState} state - Owner session read at transfer start.
 * @param {(seconds: number) => void} onWait - Safe queue stage feedback.
 * @returns {SourceAccess} Parsed session and optional countdown progress.
 */
export function sourceAccess(state: BrowserAccessState, onWait: (seconds: number) => void): SourceAccess {
  return { cookies: state.cookies ? parseCookieJar(state.cookies).cookies : [], userAgent: state.userAgent, onWait };
}
/**
 * Rebuilds credential headers for each redirect; the old origin's cookies are never blindly forwarded.
 * @param {SourceAccess | undefined} access - Optional session snapshot.
 * @param {URL} target - Independently checked outgoing target.
 * @returns {Record<string, string>} Matching cookie header and optional browser identity.
 */
export function browserHeaders(access: SourceAccess | undefined, target: URL): Record<string, string> {
  const headers: Record<string, string> = {};
  if (access) {
    const cookie = cookieHeader(access.cookies, target);
    const maximumHeaderBytes = 16_384;
    if (Buffer.byteLength(cookie) > maximumHeaderBytes) {
      throw new Error('Too many cookies match this site.');
    }
    if (cookie) {
      headers.Cookie = cookie;
    }
    if (access.userAgent) {
      headers['User-Agent'] = access.userAgent;
    }
  }
  return headers;
}
