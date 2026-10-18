import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { SYSTEM_LIMIT } from '../../shared/health.js';

/**
 * Reads at most one small field plus an overflow byte; nonblocking opens reject FIFO-style inputs safely.
 * @param {string} filename - One fixed internal thermal sensor field.
 * @returns {Promise<string | null>} Complete bounded field or explicit unavailability.
 */
export async function readKernelField(filename: string): Promise<string | null> {
  try {
    const file = await open(filename, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    try {
      if (!(await file.stat()).isFile()) {
        return null;
      }
      const bytes = Buffer.alloc(SYSTEM_LIMIT.fieldBytes + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const result = await file.read(bytes, offset, bytes.length - offset, null);
        if (!result.bytesRead) {
          break;
        }
        offset += result.bytesRead;
      }
      return offset <= SYSTEM_LIMIT.fieldBytes ? bytes.subarray(0, offset).toString('utf8').trim() : null;
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}
