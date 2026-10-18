import { SOURCE_TYPE } from '../../shared/sources.js';
import {
  JOB_OPTIONS,
  validateDestination,
  validateTorrentFiles,
  validateTorrentSelection,
} from '../../shared/jobOptions.js';

/**
 * Validates optional durable workflow fields before history can influence file paths or transfer selection.
 * @param {Record<string, unknown>} record - Parsed history record.
 */
export function validateJobOptions(record: Record<string, unknown>): void {
  if (record.payloadReady !== undefined && typeof record.payloadReady !== 'boolean') {
    throw new Error('Invalid saved payload state.');
  }
  if (record.torrentSelection !== undefined) {
    if (
      (record.sourceType !== SOURCE_TYPE.torrent && record.sourceType !== SOURCE_TYPE.magnet) ||
      !record.torrentSelection ||
      typeof record.torrentSelection !== 'object'
    ) {
      throw new Error('Invalid selection.');
    }
    const selection = record.torrentSelection as Record<string, unknown>;
    const files = selection.files === undefined ? undefined : validateTorrentFiles(selection.files);
    if (selection.selected !== undefined) {
      if (!files) {
        throw new Error('Missing torrent manifest.');
      }
      validateTorrentSelection(selection.selected, files);
    }
  }
  if (record.destination !== undefined) {
    if (!record.destination || typeof record.destination !== 'object') {
      throw new Error('Invalid destination.');
    }
    const destination = record.destination as Record<string, unknown>;
    if (
      validateDestination(destination.directory) !== destination.directory ||
      typeof destination.moved !== 'boolean' ||
      (destination.error !== null &&
        (typeof destination.error !== 'string' || destination.error.length > JOB_OPTIONS.maximumPathCharacters)) ||
      (destination.moved && (!Array.isArray(record.files) || !record.files.length))
    ) {
      throw new Error('Invalid destination.');
    }
  }
}
