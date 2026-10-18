import { useEffect, useState } from 'react';
import { API_PATH } from '../../../shared/contracts';
import type { StationHealthSnapshot } from '../../../shared/health';
import { requestApi } from '../../lib/api/requestApi';

/**
 * Loads diagnostics only while opened or explicitly refreshed, retaining older data during reconnects.
 * @returns {object} Lazy panel state and refresh actions.
 */
export function useStationHealth() {
  const [isOpen, setIsOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<StationHealthSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const controller = new AbortController();
    void requestApi<StationHealthSnapshot>(API_PATH.station, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setSnapshot(result);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setErrorMessage('Station checks could not be refreshed. Previous results may be out of date. Try again.');
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
   * Starts a check from a native disclosure event and cancels loading presentation when closed.
   * @param {boolean} value - Current disclosure state.
   */
  function setOpen(value: boolean): void {
    if (value === isOpen) {
      return;
    }
    setIsOpen(value);
    setIsLoading(value);
    setErrorMessage('');
  }
  /** Explicitly refreshes the open panel; server engine caching still applies. */
  function refresh(): void {
    if (!isOpen || isLoading) {
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    setRevision((value) => value + 1);
  }
  return { isOpen, setIsOpen: setOpen, snapshot, isLoading, errorMessage, refresh };
}
