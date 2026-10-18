import { MAXIMUM_BATCH_LINKS } from '../../../shared/batch';

/** Share-target query keys are whitelisted; arbitrary query parameters never become downloads. */
export const SHARE_FIELD = { url: 'share_url', text: 'share_text', title: 'share_title' } as const;
/** Bound shared text before parsing or keeping a browser-memory draft. */
const MAXIMUM_SHARE_TEXT = 65_536;
/** Current navigation's shared content, retained only in memory through the password gate. */
let sharedDraft = '';

/**
 * Extracts supported link schemes for owner review; this never queues anything automatically.
 * @param {string} text - Plain shared text or URL.
 * @returns {string[]} Bounded unique link candidates.
 */
export function extractSharedLinks(text: string): string[] {
  const matches = text.slice(0, MAXIMUM_SHARE_TEXT).match(/(?:https?:\/\/|magnet:\?)[^\s<>"']+/gi) ?? [];
  return [...new Set(matches)].slice(0, MAXIMUM_BATCH_LINKS);
}

/**
 * Captures a share-target navigation and removes its payload from the address bar before rendering.
 * @param {Window} browserWindow - Browser window or a controlled test equivalent.
 */
export function captureSharedLinks(browserWindow: Window): void {
  const address = new URL(browserWindow.location.href);
  if (!Object.values(SHARE_FIELD).some((key) => address.searchParams.has(key))) {
    return;
  }
  const content = [address.searchParams.get(SHARE_FIELD.url), address.searchParams.get(SHARE_FIELD.text)]
    .filter(Boolean)
    .join('\n');
  sharedDraft = extractSharedLinks(content).join('\n');
  for (const key of Object.values(SHARE_FIELD)) {
    address.searchParams.delete(key);
  }
  address.hash = 'add-download';
  browserWindow.history.replaceState(null, '', `${address.pathname}${address.search}${address.hash}`);
}

/** Returns the reviewed navigation draft. @returns {string} Link candidates, never browser-persisted. */
export function readSharedDraft(): string {
  return sharedDraft;
}

/** Clears accepted shared content so later composer mounts never resubmit an old share. */
export function clearSharedDraft(): void {
  sharedDraft = '';
}
