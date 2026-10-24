import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { vi } from 'vitest';

const documents: Document[] = [];
export const COMPANION_STATION = { origin: 'http://pi:7489', tabId: 1, incognito: false };
const PAGE_TAB = 9;
/** Opens the exact popup HTML and scripts with explicit mocked extension APIs, not duplicated UI logic.
 * @param {boolean} [paired] - Whether local storage contains a previously confirmed station.
 * @param {string} [pageUrl] - Page granted activeTab when the owner opens the popup.
 * @returns {object} Live DOM, observable API boundaries and UI lookup helpers.
 */
export function companionPopupFixture(paired = true, pageUrl = 'https://www.youtube.com/watch?v=popup-example') {
  const document = new DOMParser().parseFromString(readFileSync('browser-connector/popup.html', 'utf8'), 'text/html');
  documents.push(document);
  const chrome = {
    tabs: {
      query: vi.fn(async (query: { active?: boolean }) =>
        query.active
          ? [{ id: PAGE_TAB, url: pageUrl, incognito: false }]
          : [{ id: 1, url: `${COMPANION_STATION.origin}/#library`, incognito: false }],
      ),
      create: vi.fn(),
    },
    permissions: { request: vi.fn().mockResolvedValue(true), contains: vi.fn().mockResolvedValue(true) },
    cookies: {
      getAll: vi.fn().mockResolvedValue([
        {
          domain: '.instagram.com',
          name: 'sessionid',
          value: 'private-source-session',
          path: '/',
          secure: true,
          httpOnly: true,
          hostOnly: false,
        },
      ]),
      getAllCookieStores: vi.fn().mockResolvedValue([{ id: 'profile', tabIds: [1] }]),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue(paired ? { station: COMPANION_STATION } : {}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue([
        {
          result: {
            ok: true,
            message: 'Download added to LinkDock. Follow its progress in your library.',
          },
        },
      ]),
    },
  };
  const scripts = ['transfer.js', 'station.js', 'download.js', 'session.js', 'popup.js'];
  runInNewContext(scripts.map((file) => readFileSync(`browser-connector/${file}`, 'utf8')).join('\n'), {
    document,
    chrome,
    URL,
    AbortSignal,
    navigator: { userAgent: 'PopupBrowser' },
  });
  /** Finds an actual popup control with its native DOM behavior.
   * @param {string} id - Shipped control ID.
   * @returns {HTMLInputElement & HTMLButtonElement} Test control with value, checked and click interfaces.
   */
  function element(id: string) {
    return document.getElementById(id) as HTMLInputElement & HTMLButtonElement;
  }
  /** Types a value into a real control and emits its browser input event.
   * @param {string} id - Control ID.
   * @param {string} value - Owner-entered value.
   */
  function input(id: string, value: string): void {
    element(id).value = value;
    element(id).dispatchEvent(new Event('input'));
  }
  return { chrome, element, input, window: { document, Event } };
}
/** Releases all DOM windows and listeners after each UI workflow.
 * @returns {void} No popup callbacks remain attached.
 */
export function closeCompanionPopups(): void {
  for (const document of documents.splice(0)) {
    document.replaceChildren();
  }
}
