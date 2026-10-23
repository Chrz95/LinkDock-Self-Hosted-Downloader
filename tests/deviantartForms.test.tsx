// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DeviantartSettings } from '../src/features/settings/DeviantartSettings';
import { requestApi } from '../src/lib/api/requestApi';
import { DEVIANTART, DEVIANTART_ACTION, defaultDeviantartPreferences } from '../shared/deviantart';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const snapshot = { ...defaultDeviantartPreferences(), hasAccount: false, customClient: false, updatedAt: null };
afterEach(() => {
  cleanup();
  vi.mocked(requestApi).mockReset();
});

it('loads lazily and saves profile scope, originals and story format independently of the account', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockResolvedValue(snapshot);
  render(<DeviantartSettings />);
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(screen.getByText('DeviantArt account'));
  expect(screen.getByLabelText('DeviantArt refresh token')).not.toBeVisible();
  await user.click(screen.getByText('What to download'));
  expect(await screen.findByLabelText('Artwork & videos')).toBeChecked();
  expect(screen.getByLabelText('Journals & stories')).toBeChecked();
  await user.click(screen.getByLabelText('Scraps'));
  await user.click(screen.getByLabelText('Prefer original files when available'));
  await user.selectOptions(screen.getByLabelText('Story & journal format'), 'html');
  await user.click(screen.getByRole('button', { name: 'Save collection preferences' }));
  await waitFor(() =>
    expect(requestApi).toHaveBeenCalledWith(DEVIANTART.path, {
      method: 'POST',
      body: JSON.stringify({
        action: DEVIANTART_ACTION.preferences,
        include: ['gallery', 'journal', 'scraps'],
        original: false,
        stories: 'html',
      }),
    }),
  );
  expect(await screen.findByText(/Collection preferences saved/)).toBeVisible();
});

it('clears token/app fields immediately after submission and exposes metadata only', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockImplementation(async (_url, options) =>
    options?.body ? { ...snapshot, hasAccount: true, customClient: true } : snapshot,
  );
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt account'));
  await user.click(screen.getByText('Advanced account options'));
  await screen.findByText('Using public access');
  await user.type(screen.getByLabelText('DeviantArt refresh token'), 'fresh-token');
  await user.type(screen.getByLabelText('OAuth client ID · optional'), '12345');
  await user.type(screen.getByLabelText('OAuth client secret · optional'), 'app-secret');
  await user.click(screen.getByRole('button', { name: 'Save account credentials' }));
  await waitFor(() =>
    expect(requestApi).toHaveBeenCalledWith(DEVIANTART.path, {
      method: 'POST',
      body: JSON.stringify({
        action: DEVIANTART_ACTION.account,
        refreshToken: 'fresh-token',
        clientId: '12345',
        clientSecret: 'app-secret',
      }),
    }),
  );
  expect(screen.getByLabelText('DeviantArt refresh token')).toHaveValue('');
  expect(screen.getByLabelText('OAuth client ID · optional')).toHaveValue('');
  expect(screen.getByLabelText('OAuth client secret · optional')).toHaveValue('');
  expect(await screen.findByText('Account credentials saved · custom OAuth app')).toBeVisible();
  expect(document.body.textContent).not.toMatch(/fresh-token|app-secret/);
  expect(localStorage.length).toBe(0);
});

it('keeps a late metadata request from restoring account status after explicit removal', async () => {
  const user = userEvent.setup();
  let resolveGet: ((value: unknown) => void) | undefined;
  vi.mocked(requestApi).mockImplementation(async (_url, options) =>
    options?.body
      ? snapshot
      : new Promise((resolve) => {
          resolveGet = resolve;
        }),
  );
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt account'));
  await user.click(screen.getByText('Advanced account options'));
  await user.click(screen.getByRole('button', { name: 'Remove DeviantArt account' }));
  expect(await screen.findByText('DeviantArt account removed. Collection preferences retained.')).toBeVisible();
  await act(async () => resolveGet?.({ ...snapshot, hasAccount: true }));
  expect(screen.getByText('Using public access')).toBeVisible();
  expect(screen.queryByText('Account credentials saved')).not.toBeInTheDocument();
});

it('shows an account lock conflict without retaining a submitted secret and clears drafts when collapsed', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockImplementation(async (_url, options) => {
    if (options?.body) {
      throw new Error('Pause DeviantArt downloads before replacing or removing the account.');
    }
    return snapshot;
  });
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt account'));
  await user.click(screen.getByText('Advanced account options'));
  const input = screen.getByLabelText('DeviantArt refresh token');
  await user.type(input, 'fresh-token');
  await user.click(screen.getByRole('button', { name: 'Save account credentials' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Pause DeviantArt downloads');
  expect(input).toHaveValue('');
  await user.type(input, 'unsaved-secret');
  await user.click(screen.getByText('DeviantArt account'));
  await waitFor(() => expect(screen.queryByLabelText('DeviantArt refresh token')).not.toBeInTheDocument());
  await user.click(screen.getByText('DeviantArt account'));
  expect(screen.getByLabelText('DeviantArt refresh token')).toHaveValue('');
});
