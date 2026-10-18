/** Safe central diagnostics; callers must never pass credentials or source URLs. */
export const logger = {
  /**
   * Writes a diagnostic without leaking request payloads.
   * @param {string} message - Static description of the event.
   * @param {unknown} [error] - Optional error; only its class is recorded.
   */
  error(message: string, error?: unknown): void {
    console.error(message, error instanceof Error ? error.name : 'Unknown error');
  },
  /**
   * Writes a service lifecycle message.
   * @param {string} message - Non-sensitive operational information.
   */
  info(message: string): void {
    console.info(message);
  },
};
