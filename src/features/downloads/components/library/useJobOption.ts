import { useRef, useState } from 'react';
import { API_PATH, HTTP_METHOD } from '../../../../../shared/contracts';
import { requestApi } from '../../../../lib/api/requestApi';

/**
 * Serializes option writes and gives the job's editor independent accessible feedback.
 * @param {string} id - Existing job UUID.
 * @returns {object} Busy state, feedback and fixed endpoint mutation.
 */
export function useJobOption(id: string) {
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  /**
   * Sends one supported option update and retains edits on failure.
   * @param {string} option - Fixed route suffix.
   * @param {unknown} body - Validated server input.
   * @param {string} success - Safe success message.
   * @returns {Promise<void>} Update settled.
   */
  async function save(option: string, body: unknown, success: string): Promise<void> {
    if (active.current) {
      return;
    }
    active.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await requestApi(`${API_PATH.downloads}/${id}${option}`, {
        method: HTTP_METHOD.post,
        body: JSON.stringify(body),
      });
      setMessage(success);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Save failed.');
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return { busy, error, message, save };
}
