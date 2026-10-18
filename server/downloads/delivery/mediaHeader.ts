import type { FileHandle } from 'node:fs/promises';
import { getPreviewFormat, DELIVERY_LIMIT, type PreviewFormat } from '../../../shared/media.js';
import { HTTP_STATUS } from '../../../shared/contracts.js';
import { FileDeliveryError } from './publishedFile.js';

/** Fixed offsets and signatures avoid treating arbitrary downloaded documents as executable inline content. */
const HEADER = {
  jpeg: 'ffd8ff',
  png: '89504e470d0a1a0a',
  ebml: '1a45dfa3',
  webm: '4282847765626d',
  gif87: 'GIF87a',
  gif89: 'GIF89a',
  riff: 'RIFF',
  webp: 'WEBP',
  ftyp: 'ftyp',
  gifBytes: 6,
  riffBytes: 4,
  webpOffset: 8,
  webpEnd: 12,
  brandOffset: 8,
  brandEnd: 12,
  boxOffset: 4,
  boxEnd: 8,
  minimumFtypBytes: 16,
} as const;
/** MP4 container brands supported without claiming codec support in every browser. */
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ']);

/**
 * Compares the bounded file prefix to the specific requested raster or video container.
 * @param {Buffer} bytes - Actual header bytes.
 * @param {PreviewFormat} format - Extension-selected candidate.
 * @returns {boolean} Candidate and recognizable file prefix agree.
 */
export function matchesMediaHeader(bytes: Buffer, format: PreviewFormat): boolean {
  const hexadecimal = bytes.toString('hex');
  if (format.mime === 'image/jpeg') {
    return hexadecimal.startsWith(HEADER.jpeg);
  }
  if (format.mime === 'image/png') {
    return hexadecimal.startsWith(HEADER.png);
  }
  if (format.mime === 'image/gif') {
    const signature = bytes.subarray(0, HEADER.gifBytes).toString('ascii');
    return signature === HEADER.gif87 || signature === HEADER.gif89;
  }
  if (format.mime === 'image/webp') {
    return (
      bytes.subarray(0, HEADER.riffBytes).toString('ascii') === HEADER.riff &&
      bytes.subarray(HEADER.webpOffset, HEADER.webpEnd).toString('ascii') === HEADER.webp
    );
  }
  if (format.mime === 'video/webm') {
    return hexadecimal.startsWith(HEADER.ebml) && bytes.includes(Buffer.from(HEADER.webm, 'hex'));
  }
  return (
    bytes.length >= HEADER.minimumFtypBytes &&
    bytes.subarray(HEADER.boxOffset, HEADER.boxEnd).toString('ascii') === HEADER.ftyp &&
    bytes.readUInt32BE(0) >= HEADER.minimumFtypBytes &&
    MP4_BRANDS.has(bytes.subarray(HEADER.brandOffset, HEADER.brandEnd).toString('ascii'))
  );
}

/**
 * Reads a small prefix from the already-open file and permits only known passive media types.
 * @param {FileHandle} handle - Validated published file descriptor.
 * @param {string} name - Display filename.
 * @param {number} size - Actual opened file size.
 * @returns {Promise<PreviewFormat>} Header-checked media representation.
 */
export async function inspectPreview(handle: FileHandle, name: string, size: number): Promise<PreviewFormat> {
  const format = getPreviewFormat(name);
  if (!format) {
    throw new FileDeliveryError(
      HTTP_STATUS.unsupportedMediaType,
      'This format is download-only. Save it to your device.',
    );
  }
  if (format.kind === 'image' && size > DELIVERY_LIMIT.maximumImageBytes) {
    throw new FileDeliveryError(
      HTTP_STATUS.tooLarge,
      'This image is too large for an inline preview. Save it instead.',
    );
  }
  const header = Buffer.alloc(Math.min(size, DELIVERY_LIMIT.headerBytes));
  const { bytesRead } = await handle.read(header, 0, header.length, 0);
  if (!matchesMediaHeader(header.subarray(0, bytesRead), format)) {
    throw new FileDeliveryError(
      HTTP_STATUS.unsupportedMediaType,
      'The saved file is not recognized as this media format.',
    );
  }
  return format;
}
