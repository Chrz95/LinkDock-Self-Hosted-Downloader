import { useEffect, useState } from 'react';
import { API_PATH } from '../../../shared/contracts';
import type { PushConfiguration } from '../../../shared/notifications';
import { requestApi } from '../../lib/api/requestApi';
import {
  supportsPush,
  isBrowserSubscribed,
  enableBrowserAlerts,
  disableBrowserAlerts,
  testBrowserAlerts,
} from './browserPush';

/**
 * Keeps notification permission and browser registration separate from the station's download lifecycle.
 * @returns {object} Public setup state, feedback and explicit owner actions.
 */
export function useNotifications() {
  const [configuration, setConfiguration] = useState<PushConfiguration | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const isSupported = supportsPush();
  useEffect(() => {
    let isMounted = true;
    /** Loads capability and registration state without requesting permission. @returns {Promise<void>} Setup loaded. */
    async function load(): Promise<void> {
      try {
        const setup = await requestApi<PushConfiguration>(API_PATH.notifications);
        const subscribed = isSupported && setup.enabled ? await isBrowserSubscribed() : false;
        if (isMounted) {
          setConfiguration(setup);
          setIsSubscribed(subscribed);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Device alert setup could not be loaded.');
        }
      } finally {
        if (isMounted) {
          setIsBusy(false);
        }
      }
    }
    void load();
    return () => {
      isMounted = false;
    };
  }, [isSupported]);

  /**
   * Runs a user-authorized browser operation and exposes provider or permission failures.
   * @param {() => Promise<void>} operation - Explicit enable, disable or test action.
   * @param {string} successMessage - Confirmation after success.
   * @returns {Promise<void>} Operation and local registration refresh have completed.
   */
  async function perform(operation: () => Promise<void>, successMessage: string): Promise<void> {
    setIsBusy(true);
    setMessage('');
    setErrorMessage('');
    try {
      await operation();
      setMessage(successMessage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Browser alert operation failed.');
    } finally {
      try {
        setIsSubscribed(await isBrowserSubscribed());
      } catch {
        setIsSubscribed(false);
      }
      setIsBusy(false);
    }
  }
  return {
    configuration,
    isSubscribed,
    isBusy,
    isSupported,
    message,
    errorMessage,
    enable: () => perform(() => enableBrowserAlerts(configuration!), 'Alerts enabled on this device.'),
    disable: () => perform(disableBrowserAlerts, 'Alerts disabled on this device.'),
    test: () => perform(testBrowserAlerts, 'Test alert requested. Delivery depends on your browser.'),
  };
}
