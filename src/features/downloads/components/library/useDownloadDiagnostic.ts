import { useEffect, useRef, useState } from 'react';
import { API_PATH, HTTP_METHOD } from '../../../../../shared/contracts';
import { DIAGNOSTICS, type DownloadDiagnostic } from '../../../../../shared/diagnostics';
import { requestApi } from '../../../../lib/api/requestApi';

/** Owns one explicit probe and prevents repeated clicks, stale results and requests after unmount.
 * @param {string} id - Existing job identifier.
 * @returns {object} Independent diagnostic state and explicit check action.
 */
export function useDownloadDiagnostic(id: string) {
  const active = useRef<AbortController | null>(null);
  const [report, setReport] = useState<DownloadDiagnostic | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [id]);
  /** Starts a source check without requeuing the job or changing authentication.
   * @returns {Promise<void>} Settled check with accessible feedback.
   */
  async function run(): Promise<void> {
    if (active.current) {
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      const next = await requestApi<DownloadDiagnostic>(`${API_PATH.downloads}/${id}${DIAGNOSTICS.path}`, {
        method: HTTP_METHOD.post,
        body: '{}',
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setReport(next);
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'The connection check failed.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        active.current = null;
      }
    }
  }
  return { report, busy, error, run };
}
