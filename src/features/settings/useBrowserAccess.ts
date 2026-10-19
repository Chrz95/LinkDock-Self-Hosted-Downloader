import { useEffect, useRef, useState } from 'react';
import { BROWSER_ACCESS, BROWSER_ACTION, type BrowserAccessSnapshot } from '../../../shared/browserAccess';
import { HTTP_METHOD } from '../../../shared/contracts';
import { requestApi } from '../../lib/api/requestApi';

/** Private session import avoids localStorage, URL fields and queue-history copies of cookie values.
 * @returns {object} Lazy metadata, bounded import and serialized settings actions.
 */
export function useBrowserAccess() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<BrowserAccessSnapshot | null>(null);
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
    void requestApi<BrowserAccessSnapshot>(BROWSER_ACCESS.path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted && !active.current && current === revision.current) {
          setSnapshot(value);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Browser session status is unavailable.');
        }
      });
    return () => controller.abort();
  }, [open]);
  /**
   * Sends a fixed owner action, showing only non-secret server metadata.
   * @param {typeof BROWSER_ACTION[keyof typeof BROWSER_ACTION]} action - Import, clear or pacing.
   * @param {Record<string, unknown>} fields - Bounded action payload.
   * @returns {Promise<void>} Saved preferences or visible failure.
   */
  async function command(
    action: (typeof BROWSER_ACTION)[keyof typeof BROWSER_ACTION],
    fields: Record<string, unknown>,
  ) {
    if (active.current) {
      return;
    }
    active.current = true;
    revision.current += 1;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setSnapshot(
        await requestApi<BrowserAccessSnapshot>(BROWSER_ACCESS.path, {
          method: HTTP_METHOD.post,
          body: JSON.stringify({ action, ...fields }),
        }),
      );
      setMessage(
        action === BROWSER_ACTION.clear ? 'Imported session removed.' : 'Saved. Retry the source from Library.',
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Browser session could not be saved.');
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  /**
   * Reads an explicit owner-selected export once, without retaining its content in a React draft.
   * @param {File} file - Netscape cookie export.
   * @param {string} userAgent - Optional matching browser identifier.
   * @returns {Promise<void>} Import complete or input rejected.
   */
  async function importFile(file: File, userAgent: string) {
    if (active.current) {
      return;
    }
    if (file.size > BROWSER_ACCESS.maximumCookieBytes) {
      setError('Choose a cookies.txt export up to 256 KiB.');
      return;
    }
    try {
      const current = ++revision.current;
      const cookies = await file.text();
      if (current === revision.current) {
        await command(BROWSER_ACTION.import, { cookies, userAgent });
      }
    } catch {
      setError('The selected cookie export could not be read.');
    }
  }
  return { open, setOpen, snapshot, busy, error, message, command, importFile };
}
