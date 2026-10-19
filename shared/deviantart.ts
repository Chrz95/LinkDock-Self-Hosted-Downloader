/** Saved source preferences and bounded private account setup. */
export const DEVIANTART = {
  path: '/api/deviantart',
  legacyStage: 'Collection choices were not recorded. Restart this download to use saved Settings.',
  maximumTokenCharacters: 4_096,
  maximumClientCharacters: 256,
  maximumStateBytes: 16_384,
} as const;
export const DEVIANTART_ACTION = { account: 'account', clear: 'clear', preferences: 'preferences' } as const;
export const DEVIANTART_SECTIONS = [
  { value: 'gallery', label: 'Artwork & videos' },
  { value: 'journal', label: 'Journals & stories' },
  { value: 'scraps', label: 'Scraps' },
  { value: 'favorite', label: 'Favorites' },
  { value: 'status', label: 'Status posts' },
] as const;
export type DeviantartSection = (typeof DEVIANTART_SECTIONS)[number]['value'];
export const STORY_FORMAT = { text: 'text', html: 'html', none: 'none' } as const;
export interface DeviantartPreferences {
  include: DeviantartSection[];
  original: boolean;
  stories: (typeof STORY_FORMAT)[keyof typeof STORY_FORMAT];
}
export interface DeviantartSnapshot extends DeviantartPreferences {
  hasAccount: boolean;
  customClient: boolean;
  updatedAt: string | null;
}
/** Creates an independent default so mutable profile choices never leak between stations.
 * @returns {DeviantartPreferences} Existing gallery and text-story behavior.
 */
export function defaultDeviantartPreferences(): DeviantartPreferences {
  return { include: ['gallery', 'journal'], original: true, stories: STORY_FORMAT.text };
}
