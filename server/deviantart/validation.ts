import { DEVIANTART, DEVIANTART_SECTIONS, STORY_FORMAT } from '../../shared/deviantart.js';
import type { DeviantartPreferences } from '../../shared/deviantart.js';
export interface DeviantartCredentials {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}
/**
 * Accepts only bounded token material, never executable configuration or arbitrary extractor options.
 * @param {unknown} input - Owner-submitted account fields.
 * @returns {DeviantartCredentials} Whitelisted credentials; an omitted client uses gallery-dl's app.
 */
export function validateDeviantartCredentials(input: unknown): DeviantartCredentials {
  const value = input as Partial<DeviantartCredentials> | null;
  const refreshToken = value?.refreshToken;
  const clientId = value?.clientId ?? '';
  const clientSecret = value?.clientSecret ?? '';
  if (
    typeof refreshToken !== 'string' ||
    !refreshToken ||
    refreshToken.length > DEVIANTART.maximumTokenCharacters ||
    !/^[A-Za-z0-9._~+/-]+=*$/u.test(refreshToken) ||
    typeof clientId !== 'string' ||
    clientId.length > DEVIANTART.maximumClientCharacters ||
    (clientId !== '' && !/^\d+$/u.test(clientId)) ||
    typeof clientSecret !== 'string' ||
    clientSecret.length > DEVIANTART.maximumClientCharacters ||
    (clientSecret !== '' && !/^[A-Za-z0-9._~+/-]+=*$/u.test(clientSecret)) ||
    Boolean(clientId) !== Boolean(clientSecret)
  ) {
    throw new Error('Enter a valid refresh token and either both custom app fields or neither.');
  }
  return { refreshToken, clientId, clientSecret };
}
/**
 * Limits saved collection options to documented read-only source behavior.
 * @param {unknown} input - Submitted preferences or persisted state.
 * @returns {DeviantartPreferences} Isolated, canonical source preferences.
 */
export function validateDeviantartPreferences(input: unknown): DeviantartPreferences {
  const value = input as Partial<DeviantartPreferences> | null;
  const allowed = DEVIANTART_SECTIONS.map((section) => section.value);
  if (
    !Array.isArray(value?.include) ||
    !value.include.length ||
    value.include.length > allowed.length ||
    value.include.some((section) => !allowed.includes(section)) ||
    new Set(value.include).size !== value.include.length ||
    typeof value.original !== 'boolean' ||
    !Object.values(STORY_FORMAT).includes(value.stories!)
  ) {
    throw new Error('Choose at least one profile collection and a supported story format.');
  }
  return {
    include: allowed.filter((section) => value.include!.includes(section)),
    original: value.original,
    stories: value.stories!,
  };
}
