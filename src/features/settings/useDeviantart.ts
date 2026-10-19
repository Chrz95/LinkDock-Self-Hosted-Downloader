import { useEffect, useRef, useState } from 'react';
import { DEVIANTART, DEVIANTART_ACTION, type DeviantartSnapshot } from '../../../shared/deviantart';
import { HTTP_METHOD } from '../../../shared/contracts';
import { requestApi } from '../../lib/api/requestApi';
/** Loads non-secret source metadata lazily and serializes explicit owner setup actions.
 * @returns {object} Metadata, disclosure state and bounded action handler.
 */
export function useDeviantart() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<DeviantartSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const active = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    if (!open) {
      return;
    }
    const controller = new AbortController();
    const { current } = revision;
    void requestApi<DeviantartSnapshot>(DEVIANTART.path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted && !active.current && current === revision.current) {
          setSnapshot(value);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && current === revision.current) {
          setError('DeviantArt settings are unavailable. Remove the account to reset damaged source settings.');
        }
      });
    return () => controller.abort();
  }, [open]);
  /**
   * Sends write-only account fields or whitelisted collection preferences, never storing credentials in React state.
   * @param {typeof DEVIANTART_ACTION[keyof typeof DEVIANTART_ACTION]} action - Explicit owner operation.
   * @param {Record<string, unknown>} fields - Private setup or bounded preference fields.
   * @returns {Promise<boolean>} Whether the operation saved successfully.
   */
  async function command(
    action: (typeof DEVIANTART_ACTION)[keyof typeof DEVIANTART_ACTION],
    fields: Record<string, unknown>,
  ): Promise<boolean> {
    if (active.current) {
      return false;
    }
    active.current = true;
    revision.current += 1;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setSnapshot(
        await requestApi<DeviantartSnapshot>(DEVIANTART.path, {
          method: HTTP_METHOD.post,
          body: JSON.stringify({ action, ...fields }),
        }),
      );
      setMessage(
        action === DEVIANTART_ACTION.clear
          ? 'DeviantArt account removed. Collection preferences retained.'
          : action === DEVIANTART_ACTION.account
            ? 'Account credentials saved. Retry a DeviantArt download to verify access.'
            : 'Collection preferences saved. They apply to new DeviantArt downloads.',
      );
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'DeviantArt settings could not be saved.');
      return false;
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return { open, setOpen, snapshot, busy, error, message, command };
}
