import { HTTP_STATUS } from '../../../shared/contracts';

/** An expired session is distinct from a transient service error. */
export class AuthenticationError extends Error {}

/**
 * Sends same-origin JSON requests and converts non-success responses into useful errors.
 * @param {string} endpoint - Relative API path.
 * @param {RequestInit} [options] - Request method, signal and optional JSON body.
 * @returns {Promise<T>} Typed API response, or undefined for an empty success.
 */
export async function requestApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    const message = payload?.error ?? 'The station could not complete that request.';
    if (response.status === HTTP_STATUS.unauthorized) {
      throw new AuthenticationError(message);
    }
    throw new Error(message);
  }
  return response.status === HTTP_STATUS.noContent ? (undefined as T) : (response.json() as Promise<T>);
}
