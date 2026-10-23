// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserAccess } from '../src/features/settings/BrowserAccess';
import { VideoSites } from '../src/features/settings/VideoSites';
import { BrowserAssistance } from '../src/features/downloads/components/library/BrowserAssistance';
import { requestApi } from '../src/lib/api/requestApi';
import { BROWSER_ACCESS, BROWSER_ACTION } from '../shared/browserAccess';
import { API_PATH, DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { JOB_OPTIONS } from '../shared/jobOptions';
import { AddDownload } from '../src/features/downloads/components/AddDownload';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const COOKIE = '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t0\tverified\tsecret-value\n';
const snapshot = {
  hasCookies: false,
  cookieCount: 0,
  domainCount: 0,
  hasUserAgent: false,
  delaySeconds: 0,
  updatedAt: null,
};
afterEach(() => {
  cleanup();
  vi.mocked(requestApi).mockReset();
});

it('imports a selected cookie export privately and removes it without rendering credential values', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockImplementation(async (_url, options) => {
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    return body.action === BROWSER_ACTION.import
      ? { ...snapshot, hasCookies: true, cookieCount: 1, domainCount: 1, hasUserAgent: true }
      : snapshot;
  });
  render(<BrowserAccess />);
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(screen.getByText('Browser sessions'));
  expect(screen.getByLabelText('Import site cookies.txt')).not.toBeVisible();
  await user.click(screen.getByText('Manual import & advanced options'));
  await user.type(screen.getByLabelText('Browser User-Agent · optional'), 'Browser/1');
  const file = new File([COOKIE], 'cookies.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: async () => COOKIE });
  await user.upload(screen.getByLabelText('Import site cookies.txt'), file);
  expect(await screen.findByText('1 cookies across 1 domains')).toBeVisible();
  expect(requestApi).toHaveBeenCalledWith(BROWSER_ACCESS.path, {
    method: 'POST',
    body: JSON.stringify({ action: BROWSER_ACTION.import, cookies: COOKIE, userAgent: 'Browser/1' }),
  });
  expect(screen.queryByText('secret-value')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remove imported session' }));
  expect(await screen.findByText('Imported session removed.')).toBeVisible();
  expect(screen.getByLabelText('Browser User-Agent · optional')).toHaveValue('');
});

it('saves bounded video pacing without requesting browser cookies', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockResolvedValue(snapshot);
  render(<BrowserAccess />);
  await user.click(screen.getByText('Browser sessions'));
  await user.click(screen.getByText('Manual import & advanced options'));
  const delay = screen.getByRole('spinbutton', { name: 'Video request delay · seconds' });
  await user.clear(delay);
  await user.type(delay, '5');
  await user.click(screen.getByRole('button', { name: 'Save request delay' }));
  await waitFor(() =>
    expect(requestApi).toHaveBeenCalledWith(BROWSER_ACCESS.path, {
      method: 'POST',
      body: JSON.stringify({ action: BROWSER_ACTION.settings, delaySeconds: 5 }),
    }),
  );
});

it('does not restore cookies from a late file read after the owner removes the session', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockResolvedValue(snapshot);
  let finish: ((text: string) => void) | undefined;
  const file = new File([COOKIE], 'cookies.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  });
  render(<BrowserAccess />);
  await user.click(screen.getByText('Browser sessions'));
  await user.click(screen.getByText('Manual import & advanced options'));
  await user.upload(screen.getByLabelText('Import site cookies.txt'), file);
  await user.click(screen.getByRole('button', { name: 'Remove imported session' }));
  await act(async () => finish?.(COOKIE));
  const posted = vi
    .mocked(requestApi)
    .mock.calls.filter(([, options]) => options?.body)
    .map(([, options]) => JSON.parse(String(options!.body)));
  expect(posted.map((body) => body.action)).toEqual([BROWSER_ACTION.clear]);
});

it('queues a browser-resolved final link only after an explicit handoff submission', async () => {
  const user = userEvent.setup();
  const job: DownloadJob = {
    id: 'failed-job',
    url: 'https://example.com/countdown',
    filename: 'Download',
    status: DOWNLOAD_STATUS.failed,
    receivedBytes: 0,
    totalBytes: null,
    bytesPerSecond: 0,
    createdAt: '',
    finishedAt: '',
    errorMessage: 'Browser verification required.',
  };
  vi.mocked(requestApi).mockResolvedValue(undefined);
  render(<BrowserAssistance job={job} />);
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(screen.getByText('Browser assistance'));
  expect(screen.getByRole('link', { name: 'Open source in browser' })).toHaveAttribute('rel', 'noopener noreferrer');
  await user.type(screen.getByLabelText('Final file URL'), 'https://cdn.example.com/file.zip?token=owned');
  await user.click(screen.getByRole('button', { name: 'Queue final file link' }));
  expect(requestApi).toHaveBeenCalledWith(`${API_PATH.downloads}/${job.id}${JOB_OPTIONS.browserLink}`, {
    method: 'POST',
    body: JSON.stringify({ url: 'https://cdn.example.com/file.zip?token=owned' }),
  });
  expect(await screen.findByText(/Original record retained/)).toBeVisible();
});

it('searches the source catalogue while explaining generic Video mode for unlisted sites', async () => {
  const user = userEvent.setup();
  render(<VideoSites />);
  expect(screen.getByText('Rumble')).toBeVisible();
  await user.type(screen.getByRole('searchbox'), 'loom');
  expect(screen.getByText('Loom')).toBeVisible();
  expect(screen.queryByText('Rumble')).not.toBeInTheDocument();
  await user.clear(screen.getByRole('searchbox'));
  await user.type(screen.getByRole('searchbox'), 'unlisted-provider');
  expect(screen.getByText('No recognized match. Try Video mode for other sites.')).toBeVisible();
});

it('queues a DeviantArt gallery without applying video/MP3-only selectors', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn().mockResolvedValue(undefined);
  render(<AddDownload onAdd={onAdd} />);
  await user.click(screen.getByRole('button', { name: 'DeviantArt' }));
  expect(screen.getByRole('combobox', { name: 'Output format' })).toBeDisabled();
  expect(screen.getByText(/Stories save as text/)).toBeVisible();
  await user.type(screen.getByLabelText('File URL'), 'https://www.deviantart.com/artist/gallery');
  await user.click(screen.getByRole('button', { name: 'Add download' }));
  expect(onAdd).toHaveBeenCalledWith('https://www.deviantart.com/artist/gallery', 'deviantart', '1080');
});

it('finds the additional video sources by name and domain in Settings', async () => {
  const user = userEvent.setup();
  render(<VideoSites />);
  for (const [query, name] of [
    ['pornhub.net', 'Pornhub'],
    ['xvideos', 'XVideos'],
    ['xnxx3.com', 'XNXX'],
    ['xhamster', 'xHamster'],
    ['youporn', 'YouPorn'],
    ['redtube.com.br', 'RedTube'],
    ['spankbang', 'SpankBang'],
  ]) {
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), query!);
    expect(screen.getByText(name!, { selector: 'li' })).toBeVisible();
  }
});

it('lists independent site sessions and removes only the selected site without exposing cookies', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockResolvedValue({
    ...snapshot,
    sessions: [
      { domain: 'instagram.com', cookieCount: 1 },
      { domain: 'deviantart.com', cookieCount: 1 },
    ],
  });
  render(<BrowserAccess />);
  await user.click(screen.getByText('Browser sessions'));
  await user.click(screen.getByText('Manual import & advanced options'));
  expect(await screen.findByText('instagram.com · 1 cookies')).toBeVisible();
  expect(screen.getByText('deviantart.com · 1 cookies')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Remove instagram.com' }));
  expect(requestApi).toHaveBeenCalledWith(BROWSER_ACCESS.path, {
    method: 'POST',
    body: JSON.stringify({ action: BROWSER_ACTION.remove, domain: 'instagram.com' }),
  });
  await user.click(screen.getByText('Connect directly from your browser'));
  expect(screen.getByRole('link', { name: 'Download browser companion' })).toHaveAttribute(
    'href',
    '/linkdock-browser-connector.zip',
  );
});
