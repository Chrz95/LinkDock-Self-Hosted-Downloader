/** Sends only fixed companion operations directly to the exact saved station, without browser cookies.
 * @param {object} station - Explicitly paired origin and download-only bearer token.
 * @param {string} operation - Queue submission or self-revocation.
 * @param {object} [request] - Reviewed download payload.
 * @returns {Promise<object>} Fixed confirmation with no reflected server or credential data.
 */
async function pairedRequest(station, operation, request) {
  const companion = globalThis.LinkDockCompanion;
  const origin = companion.stationOrigin(station.origin);
  const extensionOrigin = chrome.runtime.getURL('').replace(/\/$/u, '');
  const allowed = await chrome.permissions.contains({ origins: [companion.stationPattern(origin)] });
  if (!allowed || !/^ldc_[a-f\d]{64}$/u.test(station.token ?? '')) {
    return { ok: false, message: 'Reconnect the companion to restore station permission and download access.' };
  }
  if (!['downloads', 'connection'].includes(operation)) {
    return { ok: false, message: 'Unsupported companion action.' };
  }
  try {
    const timeout = 15_000;
    const response = await fetch(`${origin}/api/companion/${operation}`, {
      method: operation === 'downloads' ? 'POST' : 'DELETE',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(timeout),
      headers: {
        Authorization: `Bearer ${station.token}`,
        'X-LinkDock-Extension': extensionOrigin,
        'Content-Type': 'application/json',
      },
      ...(operation === 'downloads' ? { body: JSON.stringify(request) } : {}),
    });
    const HTTP = { created: 201, noContent: 204, unauthorized: 401, forbidden: 403, badRequest: 400, rate: 429 };
    if (operation === 'connection' && [HTTP.noContent, HTTP.unauthorized].includes(response.status)) {
      return { ok: true, message: 'Companion download access revoked.' };
    }
    if (operation === 'downloads' && response.status === HTTP.created) {
      return { ok: true, message: 'Download added to LinkDock. Follow its progress in your library.' };
    }
    const messages = {
      [HTTP.unauthorized]: 'This connection expired or was revoked. Open your station, sign in and reconnect.',
      [HTTP.forbidden]: 'The station refused this companion. Open your station and reconnect.',
      [HTTP.badRequest]: 'The station rejected this link or its options. Check the link and library for duplicates.',
      [HTTP.rate]: 'Your station is receiving too many requests. Wait a moment before trying again.',
    };
    return {
      ok: false,
      message: messages[response.status] ?? 'The station could not complete this companion request.',
    };
  } catch {
    return {
      ok: false,
      message:
        operation === 'downloads'
          ? 'Could not confirm this download. Check your station’s library before sending again.'
          : 'Could not revoke access. Revoke this connection in station Settings when it is reachable.',
    };
  }
}

/** Revokes a paired credential before removing it locally; reports offline revocation honestly.
 * @param {object} station - Current connection, or legacy tab-mode destination.
 * @returns {Promise<object>} Clear local forgetting and remote revocation status.
 */
async function forgetStation(station) {
  let revoked = { ok: !station?.token };
  try {
    if (station?.token) {
      revoked = await pairedRequest(station, 'connection');
    }
  } catch {
    // Local forgetting must still work when extension permission APIs fail.
  }
  await chrome.storage.local.remove(station?.incognito ? 'stationIncognito' : 'station');
  return {
    ok: revoked.ok,
    message: revoked.ok
      ? 'Station forgotten. Companion download access revoked; saved site sessions are unchanged.'
      : 'Station forgotten locally. Revoke its connection in LinkDock Settings to remove remaining download access.',
  };
}

Object.assign(globalThis.LinkDockCompanion, { pairedRequest, forgetStation });
