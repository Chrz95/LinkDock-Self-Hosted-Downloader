import { useEffect, useRef, useState } from 'react';
import { probeDelivery } from '../../services/fileDelivery';

/** Explicit user actions keep media fetches out of ordinary collection polling and rendering. */
const PREVIEW_STATE = { closed: 'closed', checking: 'checking', open: 'open' } as const;

/**
 * Owns an optional preview and aborts preflight when its collection row disappears.
 * @param {string} url - Authenticated, application-built media endpoint.
 * @returns {object} Accessible preview lifecycle and error feedback.
 */
export function useMediaPreview(url: string) {
  const [state, setState] = useState<(typeof PREVIEW_STATE)[keyof typeof PREVIEW_STATE]>(PREVIEW_STATE.closed);
  const [errorMessage, setErrorMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  /** Opens recognized media only after a deliberate click. @returns {Promise<void>} Ready preview or visible error. */
  async function toggle(): Promise<void> {
    controller.current?.abort();
    if (state === PREVIEW_STATE.open) {
      setState(PREVIEW_STATE.closed);
      setErrorMessage('');
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setState(PREVIEW_STATE.checking);
    setErrorMessage('');
    try {
      await probeDelivery(url, request.signal);
      if (!request.signal.aborted) {
        setState(PREVIEW_STATE.open);
      }
    } catch (error) {
      if (!request.signal.aborted) {
        setState(PREVIEW_STATE.closed);
        setErrorMessage(
          error instanceof Error ? error.message : 'Preview unavailable. Save the original file instead.',
        );
      }
    } finally {
      if (request.signal.aborted && controller.current === request) {
        setState((previous) => (previous === PREVIEW_STATE.checking ? PREVIEW_STATE.closed : previous));
      }
    }
  }
  /** Exposes native codec, media decoding or expired-session failures without leaving a broken player visible. */
  function failed(): void {
    setState(PREVIEW_STATE.closed);
    setErrorMessage('This browser could not display the saved file. Save the original to open it on your device.');
  }
  return {
    isOpen: state === PREVIEW_STATE.open,
    isChecking: state === PREVIEW_STATE.checking,
    errorMessage,
    toggle,
    failed,
  };
}
