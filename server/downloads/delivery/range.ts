/** One bounded HTTP byte span; end is inclusive. */
export interface ByteRange {
  start: number;
  end: number;
  isPartial: boolean;
}

/**
 * Supports the single explicit, open-ended or suffix ranges used by native browser video controls.
 * @param {string | undefined} header - HTTP Range value; multiple or malformed ranges are rejected.
 * @param {number} size - Actual immutable file size.
 * @returns {ByteRange | null} Valid span, or null for an unsatisfiable request.
 */
export function resolveByteRange(header: string | undefined, size: number): ByteRange | null {
  if (header === undefined) {
    return { start: 0, end: size - 1, isPartial: false };
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || !size || (!match[1] && !match[2])) {
    return null;
  }
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) {
    return null;
  }
  if (first === undefined) {
    return last && last > 0 ? { start: Math.max(0, size - last), end: size - 1, isPartial: true } : null;
  }
  if (first >= size || (last !== undefined && last < first)) {
    return null;
  }
  return { start: first, end: Math.min(last ?? size - 1, size - 1), isPartial: true };
}
