import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { applyTheme, readTheme, THEME } from './theme';

/**
 * Exposes a keyboard-accessible appearance switch with a persistent, dark-first preference.
 * @returns {JSX.Element} Theme toggle button.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);
  /** Applies the other complete color palette without reloading or interrupting downloads. */
  function handleThemeToggle(): void {
    const nextTheme = theme === THEME.dark ? THEME.light : THEME.dark;
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }
  return (
    <button
      className="lock-button theme-toggle"
      type="button"
      onClick={handleThemeToggle}
      aria-label={theme === THEME.dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={theme === THEME.dark}
      title={theme === THEME.dark ? 'Light mode' : 'Dark mode'}
    >
      <Icon name={theme === THEME.dark ? 'sun' : 'moon'} />
    </button>
  );
}
