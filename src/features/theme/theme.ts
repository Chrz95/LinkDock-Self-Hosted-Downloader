/** Theme storage and DOM identifiers are a shared source of truth for initial paint and controls. */
export const THEME = { dark: 'dark', light: 'light', storageKey: 'linkdock-theme', attribute: 'data-theme' } as const;
/** The two fully styled workspace appearances. */
export type Theme = typeof THEME.dark | typeof THEME.light;

/**
 * Reads the saved appearance, defaulting to the designed dark workspace when storage is unavailable.
 * @returns {Theme} Valid appearance value.
 */
export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME.storageKey) === THEME.light ? THEME.light : THEME.dark;
  } catch {
    return THEME.dark;
  }
}

/**
 * Applies appearance immediately; private browsing may deny optional preference persistence.
 * @param {Theme} theme - Selected appearance.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute(THEME.attribute, theme);
  try {
    localStorage.setItem(THEME.storageKey, theme);
  } catch {
    /* The current tab still changes appearance. */
  }
}
