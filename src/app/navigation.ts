/** Stable fragment routes keep bookmarks, notification clicks and shared-link entry points working. */
export const WORKSPACE_PAGE = { overview: 'overview', library: 'library', settings: 'settings' } as const;
export type WorkspacePage = (typeof WORKSPACE_PAGE)[keyof typeof WORKSPACE_PAGE];
export interface WorkspaceNavigationProps {
  page: WorkspacePage;
}
export const PAGE_INFO = {
  overview: { href: '#main', label: 'Overview', shortLabel: 'Overview', icon: 'grid' },
  library: { href: '#downloads', label: 'Download library', shortLabel: 'Library', icon: 'download' },
  settings: { href: '#settings', label: 'Settings', shortLabel: 'Settings', icon: 'settings' },
} as const;

/**
 * Resolves only known pages, with old composer/share anchors still opening the overview.
 * @param {string} hash - Browser fragment, never a source link or filesystem path.
 * @returns {WorkspacePage} Public workspace page identifier.
 */
export function pageFromHash(hash: string): WorkspacePage {
  return (
    (Object.keys(PAGE_INFO) as WorkspacePage[]).find((page) => PAGE_INFO[page].href === hash) ?? WORKSPACE_PAGE.overview
  );
}
