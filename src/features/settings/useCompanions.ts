import { useEffect, useRef, useState } from 'react';
import { COMPANION, type CompanionConnection } from '../../../shared/companion';
import { HTTP_METHOD } from '../../../shared/contracts';
import { requestApi } from '../../lib/api/requestApi';

/** Loads revocation metadata only while the owner opens companion settings.
 * @returns {object} Independent owner metadata and revocation controls; bearer secrets never enter the UI.
 */
export function useCompanions() {
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [connections, setConnections] = useState<CompanionConnection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  useEffect(() => {
    if (!open) {
      return;
    }
    const controller = new AbortController();
    void requestApi<{ connections: CompanionConnection[] }>(COMPANION.path, { signal: controller.signal })
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          setConnections(snapshot.connections);
          setError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Could not refresh companion connections. Previous results may be out of date.');
        }
      });
    return () => controller.abort();
  }, [open, revision]);
  /** Explicitly reloads owner metadata, cancelling any older view request.
   * @returns {void} New view revision requested.
   */
  function refresh(): void {
    setError('');
    setRevision((previous) => previous + 1);
  }
  /** Revokes one download-only connection immediately and refreshes the owner list.
   * @param {string} id - Owner-selected connection, never a bearer token.
   * @returns {Promise<void>} Saved revocation or actionable failure.
   */
  async function revoke(id: string): Promise<void> {
    if (active.current) {
      return;
    }
    active.current = true;
    setBusy(true);
    setError('');
    try {
      await requestApi(`${COMPANION.path}/${id}`, { method: HTTP_METHOD.delete, body: '{}' });
      setConnections((previous) => previous?.filter((entry) => entry.id !== id) ?? null);
      refresh();
    } catch {
      setError('Could not revoke this connection. Check station access and try again.');
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return { open, setOpen, connections, busy, error, refresh, revoke };
}
