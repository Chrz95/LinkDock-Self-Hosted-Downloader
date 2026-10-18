import { createHash } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { MOVE } from './journal.js';

/**
 * Copies from a no-follow descriptor into a new file and hashes the exact published bytes.
 * @param {string} source - Validated source path.
 * @param {number} size - Immutable expected size.
 * @param {AbortSignal} signal - Pause/shutdown signal.
 * @param {string} [destination] - Exclusive new file; omission verifies an existing file.
 * @returns {Promise<string>} SHA-256 digest after size verification.
 */
export async function copyOrHash(
  source: string,
  size: number,
  signal: AbortSignal,
  destination?: string,
): Promise<string> {
  const handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const information = await handle.stat();
    if (!information.isFile() || information.size !== size) {
      throw new Error('Saved output size changed.');
    }
    const hash = createHash('sha256');
    let bytes = 0;
    const reader = handle.createReadStream({ autoClose: false });
    if (destination) {
      await pipeline(
        reader,
        async function* (sourceChunks: AsyncIterable<Buffer>) {
          for await (const chunk of sourceChunks) {
            signal.throwIfAborted();
            bytes += chunk.length;
            if (bytes > size) {
              throw new Error('Saved output grew during its move.');
            }
            hash.update(chunk);
            yield chunk;
          }
        },
        createWriteStream(destination, { flags: 'wx', mode: MOVE.fileMode, flush: true }),
        { signal },
      );
    } else {
      for await (const chunk of reader) {
        signal.throwIfAborted();
        bytes += chunk.length;
        if (bytes > size) {
          throw new Error('Saved output grew during verification.');
        }
        hash.update(chunk);
      }
    }
    signal.throwIfAborted();
    if (bytes !== size) {
      throw new Error('Saved output changed during its move.');
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}
