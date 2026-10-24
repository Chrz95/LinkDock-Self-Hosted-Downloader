import path from 'node:path';
import { MEDIA_DNS_MODE, type MediaDnsMode } from '../shared/mediaDns.js';
import { LIMIT } from './constants.js';
import { PUSH_LIMIT } from '../shared/notifications.js';

/** Validated environment values; this is the only module reading process.env. */
export interface ServerConfig {
  port: number;
  dataDirectory: string;
  accessToken: string;
  concurrency: number;
  maximumFileBytes: number;
  secureCookie: boolean;
  publicOrigin: string | undefined;
  isProduction: boolean;
  mediaCookiesFile?: string;
  mediaDnsMode?: MediaDnsMode;
  downloadBytesPerSecond?: number;
  uploadBytesPerSecond?: number;
  reservedFreeBytes?: number;
  webPushSubject?: string;
  completedDirectory?: string;
  autoUpdateTools?: boolean;
  runtimeEnvironment?: NodeJS.ProcessEnv;
}

/**
 * Rejects non-integer or out-of-range settings during startup.
 * @param {string | undefined} value - Raw environment value.
 * @param {number} fallback - Default when unset.
 * @param {number} maximum - Inclusive upper bound.
 * @returns {number} Validated positive integer.
 */
function parsePositiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsedValue = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1 || parsedValue > maximum) {
    throw new Error('A numeric environment setting is outside its documented range.');
  }
  return parsedValue;
}

/** Copies inherited process settings without reading environment variables in engine/updater modules.
 * @returns {NodeJS.ProcessEnv} Isolated environment for child processes.
 */
export function readRuntimeEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env };
}

/**
 * Loads configuration once and refuses an unprotected service.
 * @returns {ServerConfig} Configuration safe for downstream modules.
 */
export function loadServerConfig(): ServerConfig {
  const accessToken = process.env.LINKDOCK_ACCESS_TOKEN ?? '';
  if (accessToken.length < LIMIT.minimumTokenLength) {
    throw new Error('Set LINKDOCK_ACCESS_TOKEN to a random value of at least 32 characters.');
  }
  const publicOrigin = process.env.PUBLIC_ORIGIN?.trim() || undefined;
  if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin) {
    throw new Error('PUBLIC_ORIGIN must be an origin without a trailing slash or path.');
  }
  const webPushSubject = process.env.WEB_PUSH_SUBJECT?.trim() || undefined;
  if (webPushSubject) {
    const subject = new URL(webPushSubject);
    if (
      webPushSubject.length > PUSH_LIMIT.maximumSubjectLength ||
      (subject.protocol !== 'mailto:' && subject.protocol !== 'https:') ||
      !publicOrigin?.startsWith('https://') ||
      process.env.SECURE_COOKIE !== 'true'
    ) {
      throw new Error('Web Push requires a mailto/HTTPS contact, an HTTPS PUBLIC_ORIGIN and SECURE_COOKIE=true.');
    }
  }
  const mediaDnsMode = process.env.MEDIA_DNS_MODE?.trim() || MEDIA_DNS_MODE.system;
  if (!Object.values(MEDIA_DNS_MODE).includes(mediaDnsMode as MediaDnsMode)) {
    throw new Error('MEDIA_DNS_MODE must be system or cloudflare.');
  }
  return {
    mediaDnsMode: mediaDnsMode as MediaDnsMode,
    port: parsePositiveInteger(process.env.PORT, LIMIT.defaultPort, LIMIT.maximumPort),
    dataDirectory: path.resolve(process.env.DATA_DIRECTORY ?? './data'),
    completedDirectory: process.env.COMPLETED_DIRECTORY ? path.resolve(process.env.COMPLETED_DIRECTORY) : undefined,
    accessToken,
    concurrency: parsePositiveInteger(
      process.env.MAX_CONCURRENT_DOWNLOADS,
      LIMIT.defaultConcurrency,
      LIMIT.maximumConcurrency,
    ),
    maximumFileBytes:
      parsePositiveInteger(process.env.MAX_FILE_SIZE_GIB, LIMIT.defaultFileGibibytes, LIMIT.maximumPort) *
      LIMIT.bytesPerGibibyte,
    secureCookie: process.env.SECURE_COOKIE === 'true',
    publicOrigin,
    isProduction: process.env.NODE_ENV === 'production',
    mediaCookiesFile: process.env.MEDIA_COOKIES_FILE || undefined,
    webPushSubject,
    autoUpdateTools: process.env.AUTO_UPDATE_TOOLS === 'true',
    runtimeEnvironment: readRuntimeEnvironment(),
  };
}
