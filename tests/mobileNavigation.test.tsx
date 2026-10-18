// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { useDownloads } from '../src/features/downloads/hooks/useDownloads';
import { requestApi } from '../src/lib/api/requestApi';
import { API_PATH, DOWNLOAD_STATUS } from '../shared/contracts';
import { DEFAULT_POLICY } from '../shared/policy';
import { UTILITY } from '../shared/utilities';

vi.mock('../src/features/downloads/hooks/useDownloads', () => ({ useDownloads: vi.fn() }));
vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const job = {
  id: '2973533c-346f-49cf-9c9e-378378d820f8',
  url: 'https://example.com/saved.bin',
  filename: 'saved.bin',
  status: DOWNLOAD_STATUS.paused,
  receivedBytes: 1,
  totalBytes: 1,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: null,
  errorMessage: null,
};
const station: ReturnType<typeof useDownloads> = {
  snapshot: {
    jobs: [job],
    storage: { availableBytes: 1, totalBytes: 1 },
    concurrency: 1,
    maximumFileBytes: 1,
    policy: { settings: DEFAULT_POLICY, holdReason: null },
  },
  busyJobId: null,
  isLocked: false,
  errorMessage: '',
  queueDownload: vi.fn().mockResolvedValue(undefined),
  queueTorrent: vi.fn().mockResolvedValue(undefined),
  queueBatch: vi.fn().mockResolvedValue({ added: [], duplicates: [], newCount: 0 }),
  handleJobAction: vi.fn().mockResolvedValue(undefined),
  handleLibraryAction: vi.fn().mockResolvedValue(undefined),
  organizeJob: vi.fn().mockResolvedValue(undefined),
  unlockStation: vi.fn().mockResolvedValue(undefined),
  lockStation: vi.fn().mockResolvedValue(undefined),
};
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.mocked(useDownloads).mockReturnValue(station);
  vi.mocked(requestApi).mockResolvedValue({ enabled: false, reason: 'Browser alerts are disabled.' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(requestApi).mockReset();
  window.history.replaceState(null, '', '/');
});

it('separates the overview, library and consolidated settings through phone navigation', async () => {
  const user = userEvent.setup();
  render(<App />);
  const navigation = within(screen.getByRole('navigation', { name: 'Mobile workspace' }));
  expect(navigation.getAllByRole('link')).toHaveLength(Object.keys(DEFAULT_ROUTES).length);
  expect(screen.getByRole('heading', { level: 1, name: /Everything worth keeping/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Save preferences' })).not.toBeInTheDocument();
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(navigation.getByRole('link', { name: 'Library' }));
  expect(await screen.findByRole('heading', { level: 1, name: /Download library/ })).toBeVisible();
  expect(navigation.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('textbox', { name: 'File URL' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save preferences' })).not.toBeInTheDocument();
  await user.click(navigation.getByRole('link', { name: 'Settings' }));
  expect(await screen.findByRole('heading', { level: 1, name: /^Settings/ })).toBeVisible();
  expect(screen.getByText('Station controls')).toBeVisible();
  expect(screen.getByText('On this device')).toBeVisible();
  expect(screen.getByText('Station health')).toBeVisible();
  expect(screen.getByText('Download utility updates')).toBeVisible();
  await user.click(screen.getByText('Station controls'));
  expect(screen.getByRole('checkbox', { name: 'Automatically move completed downloads' })).toBeVisible();
  await user.click(screen.getByText('On this device'));
  expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  await user.click(navigation.getByRole('link', { name: 'Overview' }));
  expect(await screen.findByRole('textbox', { name: 'File URL' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Save preferences' })).not.toBeInTheDocument();
});

const DEFAULT_ROUTES = { overview: '#main', library: '#downloads', settings: '#settings' };

it('retains composer, library filters and unsaved global preferences when switching pages', async () => {
  const user = userEvent.setup();
  render(<App />);
  const navigation = within(screen.getByRole('navigation', { name: 'Workspace' }));
  await user.type(screen.getByRole('textbox', { name: 'File URL' }), 'https://example.com/draft');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Output format' }), 'mp3');
  await user.click(navigation.getByRole('link', { name: 'Download library' }));
  await user.type(await screen.findByRole('searchbox'), 'saved');
  await user.click(navigation.getByRole('link', { name: 'Settings' }));
  await user.click(await screen.findByText('Station controls'));
  await user.click(screen.getByRole('checkbox', { name: 'Automatically move completed downloads' }));
  const folder = screen.getByRole('textbox', { name: 'Default completed folder' });
  await user.clear(folder);
  await user.type(folder, 'Media/Movies');
  await user.click(navigation.getByRole('link', { name: 'Overview' }));
  expect(await screen.findByRole('textbox', { name: 'File URL' })).toHaveValue('https://example.com/draft');
  expect(screen.getByRole('combobox', { name: 'Output format' })).toHaveValue('mp3');
  await user.click(navigation.getByRole('link', { name: 'Download library' }));
  expect(await screen.findByRole('searchbox')).toHaveValue('saved');
  await user.click(navigation.getByRole('link', { name: 'Settings' }));
  expect(await screen.findByRole('textbox', { name: 'Default completed folder' })).toHaveValue('Media/Movies');
  expect(requestApi).not.toHaveBeenCalledWith(API_PATH.settings, expect.anything());
});

it('keeps native Back/Forward navigation and restores a bookmarked page after remount', async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  const navigation = within(screen.getByRole('navigation', { name: 'Workspace' }));
  await user.click(navigation.getByRole('link', { name: 'Download library' }));
  await screen.findByRole('heading', { level: 1, name: /Download library/ });
  await user.click(navigation.getByRole('link', { name: 'Settings' }));
  await screen.findByRole('heading', { level: 1, name: /^Settings/ });
  await act(async () => window.history.back());
  await waitFor(() => expect(document.title).toBe('Download library · LinkDock'));
  await act(async () => window.history.forward());
  await waitFor(() => expect(document.title).toBe('Settings · LinkDock'));
  view.unmount();
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: /^Settings/ })).toBeVisible();
});

it('focuses the current page through the skip link without navigating away from Settings', async () => {
  const user = userEvent.setup();
  window.history.replaceState(null, '', '/#settings');
  render(<App />);
  await user.click(screen.getByRole('link', { name: 'Skip to content' }));
  expect(screen.getByRole('main')).toHaveFocus();
  expect(window.location.hash).toBe('#settings');
  expect(screen.getByRole('heading', { level: 1, name: /^Settings/ })).toBeVisible();
});

it('loads maintenance independently of health and cancels page-bound requests when leaving Settings', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockImplementation((url) => {
    if (url === API_PATH.notifications) {
      return Promise.resolve({ enabled: false });
    }
    return new Promise(() => undefined);
  });
  render(<App />);
  const navigation = within(screen.getByRole('navigation', { name: 'Workspace' }));
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(navigation.getByRole('link', { name: 'Settings' }));
  await user.click(await screen.findByText('Download utility updates'));
  await waitFor(() => expect(requestApi).toHaveBeenCalledWith(UTILITY.path, { signal: expect.any(AbortSignal) }));
  expect(requestApi).not.toHaveBeenCalledWith(API_PATH.station, expect.anything());
  await user.click(screen.getByText('Station health'));
  await waitFor(() => expect(requestApi).toHaveBeenCalledWith(API_PATH.station, { signal: expect.any(AbortSignal) }));
  const signals = vi
    .mocked(requestApi)
    .mock.calls.filter(([url]) => url === API_PATH.station || url === UTILITY.path)
    .map(([, options]) => options!.signal!);
  await user.click(navigation.getByRole('link', { name: 'Overview' }));
  await screen.findByRole('textbox', { name: 'File URL' });
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

it('keeps transfer actions connected to the existing queue on the library page', async () => {
  const user = userEvent.setup();
  window.history.replaceState(null, '', '/#downloads');
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Resume saved.bin' }));
  expect(station.handleJobAction).toHaveBeenCalledWith(job.id, 'resume');
});

it('keeps a settings bookmark behind the password gate and restores it after unlocking', async () => {
  const user = userEvent.setup();
  window.history.replaceState(null, '', '/#settings');
  vi.mocked(useDownloads).mockReturnValue({ ...station, snapshot: null, isLocked: true });
  const view = render(<App />);
  expect(screen.queryByRole('heading', { level: 1, name: /^Settings/ })).not.toBeInTheDocument();
  expect(requestApi).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Station password'), 'test-password');
  await user.click(screen.getByRole('button', { name: 'Unlock station' }));
  expect(station.unlockStation).toHaveBeenCalledWith('test-password');
  vi.mocked(useDownloads).mockReturnValue(station);
  view.rerender(<App />);
  expect(screen.getByRole('heading', { level: 1, name: /^Settings/ })).toBeVisible();
});

it.each([
  ['#downloads', /Download library/],
  ['#add-download', /Everything worth keeping/],
  ['#unknown', /Everything worth keeping/],
])('honors legacy entry point %s without losing the station session', (hash, title) => {
  window.history.replaceState(null, '', `/${hash}`);
  render(<App />);
  expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible();
  expect(station.lockStation).not.toHaveBeenCalled();
});
