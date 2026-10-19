import path from 'node:path';
interface Waiter {
  start: () => void;
}
interface AccountLock {
  waiting: Waiter[];
}
const locks = new Map<string, AccountLock>();
/**
 * Reserves account state synchronously for an owner import or removal.
 * @param {string} dataDirectory - Station identity.
 * @returns {(() => void) | null} Idempotent release, or null while a transfer holds or awaits the account.
 */
export function tryDeviantartLock(dataDirectory: string): (() => void) | null {
  const key = path.resolve(dataDirectory);
  if (locks.has(key)) {
    return null;
  }
  const state: AccountLock = { waiting: [] };
  locks.set(key, state);
  return releaseAccount(key, state);
}
/**
 * Creates one idempotent release that grants the next queued worker before permitting account changes.
 * @param {string} key - Canonical station identity.
 * @param {AccountLock} state - Shared queue.
 * @returns {() => void} Single-use release.
 */
function releaseAccount(key: string, state: AccountLock): () => void {
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const next = state.waiting.shift();
    if (next) {
      next.start();
    } else {
      locks.delete(key);
    }
  };
}
/**
 * Serializes source transfers so rotating refresh tokens cannot race across engine processes.
 * @param {string} dataDirectory - Station identity.
 * @param {AbortSignal} signal - Pause/cancel signal, also effective while waiting.
 * @returns {Promise<() => void>} Account release after ownership is granted.
 */
export function acquireDeviantartLock(dataDirectory: string, signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  const release = tryDeviantartLock(dataDirectory);
  if (release) {
    return Promise.resolve(release);
  }
  const key = path.resolve(dataDirectory);
  const state = locks.get(key)!;
  return new Promise((resolve, reject) => {
    const waiter: Waiter = {
      start: () => {
        signal.removeEventListener('abort', abort);
        resolve(releaseAccount(key, state));
      },
    };
    /** Removes canceled waiters so a later worker can still progress. */
    function abort(): void {
      const index = state.waiting.indexOf(waiter);
      if (index !== -1) {
        state.waiting.splice(index, 1);
      }
      reject(signal.reason);
    }
    state.waiting.push(waiter);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
}
