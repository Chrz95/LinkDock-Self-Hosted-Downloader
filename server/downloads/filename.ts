import { LIMIT, TRANSFER } from '../constants.js';

/**
 * Produces a display filename; storage paths always use an independently generated UUID.
 * @param {URL} target - Original source URL.
 * @returns {string} A bounded filename without path or control characters.
 */
export function getSafeFilename(target: URL): string {
  const lastControlCharacterCode = 31;
  const encodedName = target.pathname.split('/').filter(Boolean).at(-1) ?? TRANSFER.genericFilename;
  let decodedName: string;
  try {
    decodedName = decodeURIComponent(encodedName);
  } catch {
    decodedName = TRANSFER.genericFilename;
  }
  const safeName = Array.from(decodedName)
    .filter((character) => character.charCodeAt(0) > lastControlCharacterCode)
    .join('')
    .replace(/[<>:"/\\|?*\u007f]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return safeName.slice(0, LIMIT.maximumFilenameLength) || TRANSFER.genericFilename;
}
