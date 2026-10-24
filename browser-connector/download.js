/** Validates a download without fetching the source or reading browser cookies.
 * @param {string} value - Current page or pasted link.
 * @param {string} sourceType - Supported station engine choice.
 * @param {string} quality - Video ceiling or MP3 representation.
 * @returns {object} Request accepted by the existing station API.
 */
function downloadRequest(value, sourceType = 'auto', quality = '1080') {
  const maximumLength = 8_192;
  const raw = value.trim();
  if (!raw || raw.length > maximumLength) {
    throw new Error('Enter a download link up to 8192 characters.');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Enter an HTTP, HTTPS or magnet link.');
  }
  if (!['http:', 'https:', 'magnet:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter an HTTP, HTTPS or magnet link without embedded passwords.');
  }
  if (
    !['auto', 'direct', 'video', 'instagram', 'deviantart', 'torrent', 'magnet'].includes(sourceType) ||
    !['best', '2160', '1440', '1080', '720', '480', '360', 'mp3-128', 'mp3-192', 'mp3-320'].includes(quality)
  ) {
    throw new Error('Choose a supported source and quality.');
  }
  return { url: raw, sourceType, quality };
}
/** Queues one download inside the station's isolated world using its existing owner session.
 * @param {string} expectedOrigin - Verified destination, including its exact port.
 * @param {object} request - User-reviewed URL and download choices.
 * @returns {Promise<object>} Fixed result without reflected links, credentials or server diagnostics.
 */
async function submitDownloadToStation(expectedOrigin, request) {
  if (location.origin !== expectedOrigin) {
    return { ok: false, message: 'The destination tab changed. Connect your station again.' };
  }
  const timeout = 15_000;
  const HTTP = { created: 201, unauthorized: 401, forbidden: 403, badRequest: 400, rate: 429 };
  const options = { credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(timeout) };
  try {
    const identity = await fetch('/api/browser-access', options);
    if (!identity.ok || (await identity.json()).connector !== 'linkdock-browser-access-v1') {
      return { ok: false, message: 'Open your station and sign in before adding a download.' };
    }
    if (location.origin !== expectedOrigin) {
      return { ok: false, message: 'The destination tab changed. Connect your station again.' };
    }
    const response = await fetch('/api/downloads', {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (response.status === HTTP.created) {
      return { ok: true, message: 'Download added to LinkDock. Follow its progress in your library.' };
    }
    const messages = {
      [HTTP.unauthorized]: 'Your station session expired. Sign in there, then try again.',
      [HTTP.forbidden]: 'Your station refused this request. Check its address and connect again.',
      [HTTP.badRequest]: 'The station rejected this link or its options. Check the link and library for duplicates.',
      [HTTP.rate]: 'Your station is receiving too many requests. Wait a moment before trying again.',
    };
    return {
      ok: false,
      message: messages[response.status] ?? 'The station could not add this download. Check its library.',
    };
  } catch {
    return {
      ok: false,
      message: 'Could not confirm this download. Check your station’s library before sending again.',
    };
  }
}

Object.assign(globalThis.LinkDockCompanion, { downloadRequest, submitDownloadToStation });
