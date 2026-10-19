// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DeviantartSettings } from '../src/features/settings/DeviantartSettings';
import { requestApi } from '../src/lib/api/requestApi';
import { navigateDeviantartAuthorization } from '../src/features/settings/deviantartNavigation';
import { DEVIANTART, defaultDeviantartPreferences } from '../shared/deviantart';
import { DEVIANTART_OAUTH } from '../shared/deviantartOAuth';
vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
vi.mock('../src/features/settings/deviantartNavigation', () => ({ navigateDeviantartAuthorization: vi.fn() }));
const snapshot = { ...defaultDeviantartPreferences(), hasAccount: false, customClient: false, updatedAt: null };
const setup = { configured: false, callbackUrl: 'http://pi.example:7489/api/deviantart/oauth/callback' };
const APP = { clientId: '123456', clientSecret: 'private-app-secret' };
/**
 * Returns distinct public setup metadata and private owner-write responses without real provider requests.
 * @param {boolean} [configured] - Whether a confidential app is already stored.
 */
function mockStation(configured = false): void {
  vi.mocked(requestApi).mockImplementation(async (endpoint) => {
    if (endpoint === DEVIANTART.path) {
      return snapshot;
    }
    if (endpoint.endsWith('/setup')) {
      return { ...setup, configured: true };
    }
    if (endpoint.endsWith('/start')) {
      return { authorizationUrl: 'https://www.deviantart.com/oauth2/authorize?state=one-use-state' };
    }
    return { ...setup, configured };
  });
}
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.mocked(requestApi).mockReset();
  vi.mocked(navigateDeviantartAuthorization).mockReset();
});

it('clears app setup secrets and enables browser sign-in without a manual token', async () => {
  const user = userEvent.setup();
  mockStation();
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeDisabled());
  await user.click(screen.getByText(/One-time app setup/));
  await waitFor(() => expect(screen.getByLabelText('OAuth callback URL')).toHaveValue(setup.callbackUrl));
  await user.type(screen.getByLabelText('App client ID'), APP.clientId);
  await user.type(screen.getByLabelText('App client secret'), APP.clientSecret);
  await user.click(screen.getByRole('button', { name: 'Save sign-in setup' }));
  await waitFor(() =>
    expect(requestApi).toHaveBeenCalledWith(`${DEVIANTART_OAUTH.path}/setup`, {
      method: 'POST',
      body: JSON.stringify(APP),
    }),
  );
  expect(screen.getByLabelText('App client ID')).toHaveValue('');
  expect(screen.getByLabelText('App client secret')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Continue to DeviantArt' }));
  await waitFor(() =>
    expect(navigateDeviantartAuthorization).toHaveBeenCalledWith(
      'https://www.deviantart.com/oauth2/authorize?state=one-use-state',
    ),
  );
  expect(requestApi).toHaveBeenCalledWith(`${DEVIANTART_OAUTH.path}/start`, { method: 'POST', body: '{}' });
  expect(screen.getByLabelText('DeviantArt refresh token')).toHaveValue('');
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(document.body.textContent).not.toContain(APP.clientSecret);
});

it('returns directly to the source panel, displays the callback outcome and cleans the URL', async () => {
  mockStation(true);
  window.history.replaceState(null, '', '/?deviantart=connected&retained=yes#settings');
  render(<DeviantartSettings />);
  expect(await screen.findByText('DeviantArt connected. Refresh tokens are managed automatically.')).toBeVisible();
  expect(window.location.search).toBe('?retained=yes');
  expect(window.location.hash).toBe('#settings');
  expect(screen.getByLabelText('DeviantArt refresh token')).toHaveValue('');
});

it('shows a fixed canceled sign-in outcome and never renders arbitrary callback text', async () => {
  mockStation(true);
  window.history.replaceState(null, '', '/?deviantart=denied#settings');
  const page = render(<DeviantartSettings />);
  expect(await screen.findByText(/sign-in was canceled/)).toBeVisible();
  page.unmount();
  window.history.replaceState(null, '', '/?deviantart=private-provider-text#settings');
  render(<DeviantartSettings />);
  await screen.findByRole('button', { name: 'Continue to DeviantArt' });
  expect(document.body.textContent).not.toContain('private-provider-text');
});

it('shows a busy-account error from sign-in and keeps the current settings form usable', async () => {
  const user = userEvent.setup();
  mockStation(true);
  const implementation = vi.mocked(requestApi).getMockImplementation()!;
  vi.mocked(requestApi).mockImplementation(async (endpoint, options) => {
    if (endpoint.endsWith('/start')) {
      throw new Error('Pause DeviantArt downloads before connecting the account.');
    }
    return implementation(endpoint, options);
  });
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Continue to DeviantArt' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Pause DeviantArt downloads');
  expect(navigateDeviantartAuthorization).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled();
});

it('does not let a late setup GET undo a successful owner submission', async () => {
  const user = userEvent.setup();
  let resolveGet: ((value: unknown) => void) | undefined;
  vi.mocked(requestApi).mockImplementation(async (endpoint) => {
    if (endpoint === DEVIANTART_OAUTH.path) {
      return new Promise((resolve) => {
        resolveGet = resolve;
      });
    }
    return endpoint === DEVIANTART.path ? snapshot : { ...setup, configured: true };
  });
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  await user.click(screen.getByText(/One-time app setup/));
  await user.type(screen.getByLabelText('App client ID'), APP.clientId);
  await user.type(screen.getByLabelText('App client secret'), APP.clientSecret);
  await user.click(screen.getByRole('button', { name: 'Save sign-in setup' }));
  await screen.findByText(/App setup saved/);
  await act(async () => resolveGet?.(setup));
  expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled();
  expect(screen.getByLabelText('OAuth callback URL')).toHaveValue(setup.callbackUrl);
});
