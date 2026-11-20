import { useState } from 'react';

/** Tracks a pending browser action and exposes its result to the page. */
export function useBrowserAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  /** Runs one operation at a time and reports a safe error or confirmation.
   * @param {() => Promise<void>} action - Navigation or queue request.
   */
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The station could not complete this request.');
    } finally {
      setBusy(false);
    }
  }

  return { busy, message, setMessage, run };
}
