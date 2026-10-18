/** Binary storage display uses one fractional digit above bytes. */
const BYTE_DISPLAY = { binaryBase: 1_024, fractionDigits: 1 } as const;

/**
 * Formats binary byte quantities, including unknown content lengths.
 * @param {number | null} bytes - Byte count, or null when the source omitted its length.
 * @returns {string} Compact readable storage size.
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'Unknown size';
  }
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(BYTE_DISPLAY.binaryBase)),
    units.length - 1,
  );
  const quantity = bytes / BYTE_DISPLAY.binaryBase ** unitIndex;
  return `${quantity.toFixed(unitIndex === 0 ? 0 : BYTE_DISPLAY.fractionDigits)} ${units[unitIndex]}`;
}
