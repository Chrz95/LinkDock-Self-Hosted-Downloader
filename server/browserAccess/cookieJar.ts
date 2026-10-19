import { BROWSER_ACCESS } from '../../shared/browserAccess.js';
const COOKIE_FORMAT = { fields: 7, maximumDomainLength: 253 } as const;

export interface BrowserCookie {
  domain: string;
  subdomains: boolean;
  path: string;
  secure: boolean;
  expires: number;
  name: string;
  value: string;
}
/**
 * Validates bounded Netscape exports without accepting JSON, executable options or request-header injection.
 * @param {unknown} input - Owner-exported cookie text.
 * @returns {{text: string; cookies: BrowserCookie[]}} Normalized jar and validated cookie rows.
 */
export function parseCookieJar(input: unknown): { text: string; cookies: BrowserCookie[] } {
  if (typeof input !== 'string' || Buffer.byteLength(input) > BROWSER_ACCESS.maximumCookieBytes) {
    throw new Error('Choose a Netscape cookies.txt export up to 256 KiB.');
  }
  const text = input.replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n');
  if (
    !/^# (?:Netscape HTTP Cookie File|HTTP Cookie File)\n/u.test(text) ||
    text.includes(String.fromCharCode(0)) ||
    text.includes('\r')
  ) {
    throw new Error('Use a browser-exported Netscape cookies.txt file.');
  }
  const cookies: BrowserCookie[] = [];
  for (const line of text.split('\n')) {
    if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) {
      continue;
    }
    const fields = line.replace(/^#HttpOnly_/u, '').split('\t');
    const [domain, include, cookiePath, secure, expires, name, value] = fields;
    const domainName = domain?.replace(/^\./u, '').toLowerCase();
    if (
      fields.length !== COOKIE_FORMAT.fields ||
      !domainName ||
      domainName.length > COOKIE_FORMAT.maximumDomainLength ||
      !/^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/u.test(domainName) ||
      domainName.includes('..') ||
      !['TRUE', 'FALSE'].includes(include!) ||
      !['TRUE', 'FALSE'].includes(secure!) ||
      !cookiePath?.startsWith('/') ||
      /[\p{Cc};]/u.test(cookiePath) ||
      !/^\d+$/u.test(expires!) ||
      !Number.isSafeInteger(Number(expires)) ||
      !name ||
      !/^[!#$%&'*+.^_`|~\da-z-]+$/iu.test(name) ||
      /[\p{Cc};]/u.test(value!) ||
      cookies.length >= BROWSER_ACCESS.maximumCookies
    ) {
      throw new Error('The cookie export contains an invalid or excessive cookie row.');
    }
    cookies.push({
      domain: domainName,
      subdomains: include === 'TRUE',
      path: cookiePath,
      secure: secure === 'TRUE',
      expires: Number(expires),
      name,
      value: value!,
    });
  }
  if (!cookies.length) {
    throw new Error('The export contains no cookies. Export only the sites needed for your download.');
  }
  return { text: `${text.replace(/\n*$/u, '')}\n`, cookies };
}

/**
 * Selects cookies for this redirect target, respecting domain, path, HTTPS and expiry boundaries.
 * @param {BrowserCookie[]} cookies - Validated owner jar.
 * @param {URL} target - Independently validated request target.
 * @returns {string} Matching Cookie header, without unrelated site credentials.
 */
export function cookieHeader(cookies: BrowserCookie[], target: URL): string {
  const now = Date.now() / BROWSER_ACCESS.millisecondsPerSecond;
  return cookies
    .filter(
      (cookie) =>
        (target.hostname === cookie.domain || (cookie.subdomains && target.hostname.endsWith(`.${cookie.domain}`))) &&
        (!cookie.secure || target.protocol === 'https:') &&
        (!cookie.expires || cookie.expires > now) &&
        (target.pathname === cookie.path ||
          target.pathname.startsWith(cookie.path.endsWith('/') ? cookie.path : `${cookie.path}/`)),
    )
    .sort((first, second) => second.path.length - first.path.length)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}
