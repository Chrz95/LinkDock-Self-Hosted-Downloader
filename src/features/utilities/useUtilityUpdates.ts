import { useEffect, useRef, useState } from 'react';
import { UTILITY, UTILITY_STATUS, UTILITY_ACTION, type UtilitySnapshot } from '../../../shared/utilities';
import { HTTP_METHOD } from '../../../shared/contracts';
import { requestApi } from '../../lib/api/requestApi';

const POLL = { active: 5_000, idle: 30_000 } as const;
/** Loads updater state only while its panel is open. @returns {object} State and authenticated fixed commands. */
export function useUtilityUpdates() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<UtilitySnapshot | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const revision = useRef(0);
  useEffect(() => {
    if (!open) {
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    /** Fetches sequential snapshots without overwriting a newer command response.
     * @returns {Promise<void>} Poll scheduled or canceled.
     */
    async function poll(): Promise<void> {
      const { current } = revision;
      let active = false;
      try {
        const value = await requestApi<UtilitySnapshot>(UTILITY.path, { signal: controller.signal });
        active = value.requested || value.status === UTILITY_STATUS.updating;
        if (!controller.signal.aborted && revision.current === current && !busy.current) {
          setSnapshot(value);
          setError('');
        }
      } catch {
        if (!controller.signal.aborted) {
          setError('Cannot reach utility updates. Reconnecting…');
        }
      }
      if (!controller.signal.aborted) {
        timer = setTimeout(() => void poll(), active ? POLL.active : POLL.idle);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open]);
  /**
   * Sends only a fixed updater action with optional strict settings.
   * @param {typeof UTILITY_ACTION[keyof typeof UTILITY_ACTION]} action - Supported command.
   * @param {boolean} [enabled] - Optional automatic-update preference.
   * @returns {Promise<void>} Feedback updated after persistence.
   */
  async function command(
    action: (typeof UTILITY_ACTION)[keyof typeof UTILITY_ACTION],
    enabled?: boolean,
  ): Promise<void> {
    if (busy.current) {
      return;
    }
    busy.current = true;
    revision.current += 1;
    setSaving(true);
    setError('');
    try {
      const value = await requestApi<UtilitySnapshot>(UTILITY.path, {
        method: HTTP_METHOD.post,
        body: JSON.stringify({ action, ...(enabled === undefined ? {} : { enabled }) }),
      });
      revision.current += 1;
      setSnapshot(value);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Utility command failed.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return { open, setOpen, snapshot, error, saving, command };
}
