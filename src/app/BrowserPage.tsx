import { useState } from 'react';
import { STATION_BROWSER_PATH, type BrowserPage as Page } from '../../shared/stationBrowser';
import { requestApi } from '../lib/api/requestApi';
import type { StationWorkspaceProps } from './StationWorkspace.types';
import { BrowserPreview } from './BrowserPreview';
import { useBrowserAction } from './useBrowserAction';

const PREVIOUS_PAGES = 19;
const CURRENT_AND_PREVIOUS = 2;

/** Opens public pages on the station and queues links using the workspace download command.
 * @param {Pick<StationWorkspaceProps, 'onAdd'>} props - Existing queue command.
 * @returns {JSX.Element} Station web browser.
 */
export function BrowserPage({ onAdd }: Pick<StationWorkspaceProps, 'onAdd'>) {
  const [address, setAddress] = useState('');
  const [history, setHistory] = useState<Page[]>([]);
  const { busy, message, setMessage, run } = useBrowserAction();
  const page = history.at(-1);

  /** Fetches page text and links through the authenticated station API.
   * @param {string} url - Address or selected link.
   */
  async function open(url: string) {
    const next = await requestApi<Page>(STATION_BROWSER_PATH, {
      method: 'POST',
      body: JSON.stringify({ url: url.trim() }),
    });
    setHistory((previous) => [...previous.slice(-PREVIOUS_PAGES), next]);
    setAddress(next.url);
  }

  /** Sends a source URL to the normal download queue.
   * @param {string} url - Address or selected source.
   */
  async function queue(url: string) {
    await onAdd(url.trim());
    setMessage('Added to the download queue.');
  }

  return (
    <section className="station-browser">
      <h1>Browser</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => open(address));
        }}
      >
        <label htmlFor="browser-address">Website or file address</label>
        <div className="browser-actions">
          <input
            id="browser-address"
            type="url"
            required
            placeholder="https://example.com"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <button
            className="primary-button"
            disabled={busy}
          >
            Open
          </button>
          <button
            type="button"
            disabled={busy || !address.trim()}
            onClick={() => void run(() => queue(address))}
          >
            Queue address
          </button>
          <button
            type="button"
            disabled={busy || history.length < CURRENT_AND_PREVIOUS}
            onClick={() => {
              setHistory(history.slice(0, -1));
              setAddress(history.at(-CURRENT_AND_PREVIOUS)!.url);
              setMessage('');
            }}
          >
            Back
          </button>
        </div>
      </form>
      <output>{busy ? 'Working…' : message}</output>
      {page && (
        <BrowserPreview
          page={page}
          busy={busy}
          onOpen={(url) => void run(() => open(url))}
          onQueue={(url) => void run(() => queue(url))}
        />
      )}
    </section>
  );
}
