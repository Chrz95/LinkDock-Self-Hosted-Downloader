import { useEffect, useRef, useState } from 'react';
import { API_PATH, HTTP_METHOD } from '../../../shared/contracts';
import { NOTIFICATION_PATH, type AlertDeliveryStatus } from '../../../shared/notifications';
import { requestApi } from '../../lib/api/requestApi';

const ENDPOINT = `${API_PATH.notifications}${NOTIFICATION_PATH.outbox}`;
/**
 * Loads private delivery counts only when opened; clearing never requests permission or sends a test.
 * @returns {object} Lazy snapshot, explicit refresh/clear controls and retained failure feedback.
 */
export function useAlertDelivery() {
  const [isOpen, setIsOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<AlertDeliveryStatus | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pendingMutation = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const controller = new AbortController();
    void requestApi<AlertDeliveryStatus>(ENDPOINT, { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          setStatus(next);
          setUpdatedAt(new Date().toLocaleTimeString());
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : 'Alert status unavailable.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => controller.abort();
  }, [isOpen, revision]);
  /**
   * Updates loading presentation from the native disclosure event rather than from an effect.
   * @param {boolean} open - Current disclosure state.
   */
  function setOpen(open: boolean): void {
    if (open !== isOpen) {
      setIsOpen(open);
      setIsLoading(open);
      setError('');
    }
  }
  /** Explicitly requests a fresh snapshot while preserving previous data through network errors. */
  function refresh(): void {
    if (!isOpen || isLoading || pendingMutation.current) {
      return;
    }
    setIsLoading(true);
    setError('');
    setRevision((value) => value + 1);
  }
  /**
   * Clears pending attempts through the protected API; already-sending requests cannot be recalled.
   * @returns {Promise<void>} Explicit clear acknowledged and a fresh snapshot requested, or error exposed.
   */
  async function clear(): Promise<void> {
    if (pendingMutation.current || isLoading) {
      return;
    }
    pendingMutation.current = true;
    setIsClearing(true);
    setError('');
    setMessage('');
    try {
      await requestApi(ENDPOINT, { method: HTTP_METHOD.delete, body: '{}' });
      setMessage('Pending alerts cleared. Requests already sending may still finish.');
      setIsLoading(true);
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Pending alerts could not be cleared.');
    } finally {
      pendingMutation.current = false;
      setIsClearing(false);
    }
  }
  return {
    isOpen,
    setIsOpen: setOpen,
    status,
    updatedAt,
    isBusy: isLoading || isClearing,
    error,
    message,
    refresh,
    clear,
  };
}
