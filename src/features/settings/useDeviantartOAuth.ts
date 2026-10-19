import { useEffect, useRef, useState } from 'react';
import {
  DEVIANTART_OAUTH,
  DEVIANTART_OAUTH_RESULT,
  type DeviantartOAuthResult,
  type DeviantartOAuthSnapshot,
} from '../../../shared/deviantartOAuth';
import { requestApi } from '../../lib/api/requestApi';
import { deviantartAuthorizationAddress, navigateDeviantartAuthorization } from './deviantartNavigation';
/**
 * Reads only a fixed callback outcome, then removes the non-secret status marker from browser history.
 * @returns {string} Application-authored result text.
 */
function connectionResult(): string {
  const value = new URLSearchParams(window.location.search).get(DEVIANTART_OAUTH.resultParameter);
  return value && Object.hasOwn(DEVIANTART_OAUTH_RESULT, value)
    ? DEVIANTART_OAUTH_RESULT[value as DeviantartOAuthResult]
    : '';
}
/**
 * Owns app setup and same-tab sign-in for mobile and desktop without retaining secrets or codes in browser storage.
 * @returns {object} Non-secret setup status and serialized owner actions.
 */
export function useDeviantartOAuth() {
  const [snapshot, setSnapshot] = useState<DeviantartOAuthSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(connectionResult);
  const [authorizationUrl, setAuthorizationUrl] = useState('');
  const active = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const { current } = revision;
    const url = new URL(window.location.href);
    if (url.searchParams.has(DEVIANTART_OAUTH.resultParameter)) {
      url.searchParams.delete(DEVIANTART_OAUTH.resultParameter);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    void requestApi<DeviantartOAuthSnapshot>(DEVIANTART_OAUTH.path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted && !active.current && current === revision.current) {
          setSnapshot(value);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && current === revision.current) {
          setError('Sign-in setup could not be loaded. You can save the app setup again.');
        }
      });
    return () => controller.abort();
  }, []);
  /**
   * Saves a confidential app or starts a provider-owned login page; tokens remain on the station.
   * @param {'setup' | 'start' | 'complete'} action - Explicit owner operation.
   * @param {Record<string, unknown>} [fields] - Write-only app fields or the one-use authorization response.
   * @returns {Promise<boolean>} True after an account connection; all other outcomes retain visible guidance.
   */
  async function command(action: 'setup' | 'start' | 'complete', fields?: Record<string, unknown>): Promise<boolean> {
    if (active.current) {
      return false;
    }
    active.current = true;
    revision.current += 1;
    setBusy(true);
    setError('');
    setMessage('');
    if (action === 'start') {
      setAuthorizationUrl('');
    }
    try {
      const result = await requestApi<
        DeviantartOAuthSnapshot & {
          authorizationUrl?: string;
          result?: DeviantartOAuthResult;
        }
      >(`${DEVIANTART_OAUTH.path}/${action}`, { method: 'POST', body: JSON.stringify(fields ?? {}) });
      if (action === 'start' && result.authorizationUrl) {
        if (result.returnMode === 'copy') {
          setAuthorizationUrl(deviantartAuthorizationAddress(result.authorizationUrl));
        } else {
          navigateDeviantartAuthorization(result.authorizationUrl);
        }
      } else if (action === 'setup') {
        setSnapshot({ configured: true, callbackUrl: result.callbackUrl, returnMode: result.returnMode });
        setAuthorizationUrl('');
        setMessage('App setup saved. Continue to DeviantArt to connect your account.');
      } else if (action === 'complete' && result.result && Object.hasOwn(DEVIANTART_OAUTH_RESULT, result.result)) {
        setAuthorizationUrl('');
        if (result.result === 'connected') {
          setMessage(DEVIANTART_OAUTH_RESULT.connected);
          return true;
        }
        setError(DEVIANTART_OAUTH_RESULT[result.result]);
      } else {
        throw new Error('DeviantArt sign-in could not start.');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'DeviantArt sign-in could not start.');
    } finally {
      active.current = false;
      setBusy(false);
    }
    return false;
  }
  return { snapshot, busy, error, message, authorizationUrl, command };
}
