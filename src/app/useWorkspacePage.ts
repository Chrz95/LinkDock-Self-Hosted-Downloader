import { useEffect, useState } from 'react';
import { PAGE_INFO, pageFromHash } from './navigation';

/**
 * Tracks native browser navigation while the shared session and queue polling stay mounted.
 * @returns {WorkspacePage} Active page restored from bookmarks and Back/Forward history.
 */
export function useWorkspacePage() {
  const [page, setPage] = useState(() => pageFromHash(window.location.hash));
  useEffect(() => {
    /** Applies a link, history traversal or notification fragment without reloading the application. */
    function updatePage(): void {
      setPage(pageFromHash(window.location.hash));
    }
    window.addEventListener('hashchange', updatePage);
    return () => window.removeEventListener('hashchange', updatePage);
  }, []);
  useEffect(() => {
    document.title = `${PAGE_INFO[page].label} · LinkDock`;
    document.getElementById('main')?.focus();
  }, [page]);
  return page;
}
