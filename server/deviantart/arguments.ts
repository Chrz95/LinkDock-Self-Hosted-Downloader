import { defaultDeviantartPreferences, type DeviantartPreferences } from '../../shared/deviantart.js';
import type { DeviantartExecution } from './session.js';
import { ENGINE_LIMIT } from '../engines/constants.js';
/**
 * Adds documented read-only extractor options; credentials themselves never enter process arguments.
 * @param {DeviantartExecution} [execution] - Snapshotted preferences and private config/cache paths.
 * @param {DeviantartPreferences} [savedPreferences] - Pinned choices when no account session is required.
 * @returns {string[]} Fixed, bounded source options.
 */
export function deviantartArguments(
  execution?: DeviantartExecution,
  savedPreferences?: DeviantartPreferences,
): string[] {
  const preferences = execution?.preferences ?? savedPreferences ?? defaultDeviantartPreferences();
  return [
    '--http-timeout',
    String(ENGINE_LIMIT.mediaSocketTimeoutSeconds),
    '--retries',
    String(ENGINE_LIMIT.mediaRetryCount),
    ...(execution?.configFile ? ['--config', execution.configFile] : []),
    '-o',
    'filename={category}_{index}.{extension}',
    '-o',
    `extractor.deviantart.journals=${preferences.stories}`,
    '-o',
    `extractor.deviantart.original=${String(preferences.original)}`,
    '-o',
    'extractor.deviantart.flat=false',
    '-o',
    `extractor.deviantart.include=${preferences.include.join(',')}`,
    '-o',
    'extractor.deviantart.extra=false',
    '-o',
    'extractor.deviantart.auto-unwatch=false',
    '-o',
    'extractor.deviantart.auto-watch=false',
    '-o',
    'extractor.deviantart.comments=false',
    '-o',
    'extractor.deviantart.quality=100',
  ];
}
