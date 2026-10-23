/** Serializes only the selected domain and its subdomains; never exports other account sessions.
 * @param {object[]} cookies - Browser cookie API rows.
 * @param {string} domain - Explicitly selected supported source.
 * @returns {string} Bounded server-validated Netscape payload.
 */
function sessionExport(cookies, domain) {
  if (!['instagram.com', 'deviantart.com'].includes(domain)) {
    throw new Error('Unsupported source.');
  }
  const rows = cookies.filter((cookie) => {
    const host = cookie.domain.replace(/^\./u, '');
    return (host === domain || host.endsWith(`.${domain}`)) && !cookie.partitionKey;
  });
  if (!rows.length) {
    throw new Error('No session found. Sign in to this source in the same browser profile first.');
  }
  if (domain === 'instagram.com' && !rows.some((cookie) => cookie.name === 'sessionid' && cookie.value)) {
    throw new Error('Instagram login session is missing. Sign in before sending.');
  }
  return (
    '# Netscape HTTP Cookie File\n' +
    rows
      .map((cookie) =>
        [
          `${cookie.httpOnly ? '#HttpOnly_' : ''}${cookie.domain}`,
          cookie.hostOnly ? 'FALSE' : 'TRUE',
          cookie.path,
          cookie.secure ? 'TRUE' : 'FALSE',
          Math.floor(cookie.expirationDate ?? 0),
          cookie.name,
          cookie.value,
        ].join('\t'),
      )
      .join('\n') +
    '\n'
  );
}
/** Runs in the active station tab's isolated world, using its existing owner session and same-origin CSRF policy.
 * @param {string} expectedOrigin - Destination explicitly confirmed by the user.
 * @param {string} cookies - Selected site's private session, never returned to the popup.
 * @param {string} userAgent - Matching browser identity.
 * @returns {Promise<object>} Fixed, non-secret status only.
 */
async function sendToStation(expectedOrigin, cookies, userAgent) {
  if (location.origin !== expectedOrigin) {
    return { ok: false, message: 'The destination tab changed. Reopen the companion.' };
  }
  try {
    const endpoint = '/api/browser-access';
    const timeoutMilliseconds = 15_000;
    const options = { credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(timeoutMilliseconds) };
    const metadata = await fetch(endpoint, options);
    if (!metadata.ok || (await metadata.json()).connector !== 'linkdock-browser-access-v1') {
      return { ok: false, message: 'Open LinkDock 2.23 or newer and sign in before sending.' };
    }
    const response = await fetch(endpoint, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import', cookies, userAgent }),
    });
    return response.ok
      ? { ok: true, message: 'Session saved. Other sites are unchanged. Retry your download in LinkDock.' }
      : { ok: false, message: 'Session not saved. Check station access and cookie limits, then retry.' };
  } catch {
    return { ok: false, message: 'Could not reach this station. Check the address and sign in again.' };
  }
}

globalThis.LinkDockCompanion = { sessionExport, sendToStation };
