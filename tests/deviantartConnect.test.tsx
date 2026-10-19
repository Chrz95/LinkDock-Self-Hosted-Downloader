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
import { AUTHORIZATION_URL } from './helpers/deviantartAuthorization';
vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
vi.mock('../src/features/settings/deviantartNavigation', async (original) => ({
  ...(await original<typeof import('../src/features/settings/deviantartNavigation')>()),
  navigateDeviantartAuthorization: vi.fn(),
}));
const snapshot = { ...defaultDeviantartPreferences(), hasAccount: false, customClient: false, updatedAt: null };
const setup = {
  configured: false,
  callbackUrl: 'https://pi.example/api/deviantart/oauth/callback',
  returnMode: 'direct',
};
const APP = { clientId: '123456', clientSecret: 'private-app-secret' };
/**
 * Returns distinct public setup metadata and private owner-write responses without real provider requests.
 * @param {boolean} [configured] - Whether a confidential app is already stored.
 * @param {'direct' | 'copy'} [returnMode] - HTTPS callback or HTTP-compatible copy response.
 */
function mockStation(configured = false, returnMode: 'direct' | 'copy' = 'direct'): void {
  vi.mocked(requestApi).mockImplementation(async (endpoint) => {
    if (endpoint === DEVIANTART.path) {
      return snapshot;
    }
    if (endpoint.endsWith('/setup')) {
      return { ...setup, configured: true };
    }
    if (endpoint.endsWith('/start')) {
      return { authorizationUrl: AUTHORIZATION_URL, returnMode };
    }
    return {
      ...setup,
      configured,
      returnMode,
      callbackUrl: returnMode === 'copy' ? DEVIANTART_OAUTH.landing : setup.callbackUrl,
    };
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
  expect(screen.getByText(/This station uses an automatic HTTPS return/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Continue to DeviantArt' }));
  await waitFor(() => expect(navigateDeviantartAuthorization).toHaveBeenCalledWith(AUTHORIZATION_URL));
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

it('keeps HTTP sign-in in the original tab and exchanges a cleared response field automatically', async () => {
  const user = userEvent.setup();
  mockStation(true, 'copy');
  let connected = false;
  const implementation = vi.mocked(requestApi).getMockImplementation()!;
  vi.mocked(requestApi).mockImplementation(async (endpoint, options) => {
    if (endpoint.endsWith('/complete')) {
      connected = true;
      return { result: 'connected' };
    }
    if (endpoint === DEVIANTART.path && connected) {
      return { ...snapshot, hasAccount: true, customClient: true };
    }
    return implementation(endpoint, options);
  });
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled());
  expect(screen.getByLabelText('OAuth callback URL')).toHaveValue(DEVIANTART_OAUTH.landing);
  expect(screen.getByLabelText('Authorization response URL')).toBeVisible();
  expect(screen.getByLabelText('Authorization response URL')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Continue to DeviantArt' }));
  const link = await screen.findByRole('link', { name: 'Open DeviantArt sign-in' });
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(link).toHaveAttribute('href', AUTHORIZATION_URL);
  const fullLink = screen.getByLabelText('Full authorization URL');
  expect(fullLink).toHaveValue(AUTHORIZATION_URL);
  await user.click(fullLink);
  expect((fullLink as HTMLInputElement).selectionStart).toBe(0);
  expect((fullLink as HTMLInputElement).selectionEnd).toBe(AUTHORIZATION_URL.length);
  expect(navigateDeviantartAuthorization).not.toHaveBeenCalled();
  expect(screen.getByText(/connection error at localhost:6414/)).toBeVisible();
  const responseUrl = 'http://localhost:6414/?state=one-use-state&code=private-code';
  const input = screen.getByLabelText('Authorization response URL');
  expect(input).toBeEnabled();
  await user.type(input, responseUrl);
  await user.click(screen.getByRole('button', { name: 'Finish connection' }));
  await waitFor(() =>
    expect(requestApi).toHaveBeenCalledWith(`${DEVIANTART_OAUTH.path}/complete`, {
      method: 'POST',
      body: JSON.stringify({ responseUrl }),
    }),
  );
  expect(input).toHaveValue('');
  expect(await screen.findByText('DeviantArt connected. Refresh tokens are managed automatically.')).toBeVisible();
  expect(await screen.findByText('Account credentials saved · custom OAuth app')).toBeVisible();
  expect(screen.getByLabelText('Authorization response URL')).toBeDisabled();
  expect(document.body.textContent).not.toContain('private-code');
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

it('clears a rejected HTTP return input and retains the form for correction', async () => {
  const user = userEvent.setup();
  mockStation(true, 'copy');
  const implementation = vi.mocked(requestApi).getMockImplementation()!;
  vi.mocked(requestApi).mockImplementation(async (endpoint, options) => {
    if (endpoint.endsWith('/complete')) {
      throw new Error('Paste the complete authorization response URL.');
    }
    return implementation(endpoint, options);
  });
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Continue to DeviantArt' }));
  const input = await screen.findByLabelText('Authorization response URL');
  await user.type(input, 'private-invalid-response');
  await user.click(screen.getByRole('button', { name: 'Finish connection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Paste the complete authorization response URL.');
  expect(input).toHaveValue('');
  expect(screen.getByRole('link', { name: 'Open DeviantArt sign-in' })).toBeVisible();
  expect(document.body.textContent).not.toContain('private-invalid-response');
});

it('requires a new start after an expired or canceled HTTP connection', async () => {
  const user = userEvent.setup();
  mockStation(true, 'copy');
  const implementation = vi.mocked(requestApi).getMockImplementation()!;
  vi.mocked(requestApi).mockImplementation(async (endpoint, options) =>
    endpoint.endsWith('/complete') ? { result: 'expired' } : implementation(endpoint, options),
  );
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Continue to DeviantArt' }));
  await user.type(
    await screen.findByLabelText('Authorization response URL'),
    'http://localhost:6414/?code=old&state=old',
  );
  await user.click(screen.getByRole('button', { name: 'Finish connection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This sign-in expired or belongs to another browser.');
  expect(screen.getByLabelText('Authorization response URL')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled();
});

it('keeps a homepage recovery hint visible and replaces the complete link on a new sign-in', async () => {
  const user = userEvent.setup();
  mockStation(true, 'copy');
  let starts = 0;
  const implementation = vi.mocked(requestApi).getMockImplementation()!;
  const fresh = new URL(AUTHORIZATION_URL);
  fresh.searchParams.set('state', 'N'.repeat(DEVIANTART_OAUTH.proofCharacters));
  vi.mocked(requestApi).mockImplementation(async (endpoint, options) => {
    if (endpoint.endsWith('/start')) {
      starts += 1;
      return { authorizationUrl: starts === 1 ? AUTHORIZATION_URL : fresh.href, returnMode: 'copy' };
    }
    if (endpoint.endsWith('/complete')) {
      throw new Error(DEVIANTART_OAUTH.homepageMessage);
    }
    return implementation(endpoint, options);
  });
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  expect(screen.getByRole('link', { name: 'Sign in to DeviantArt first' })).toHaveAttribute(
    'href',
    'https://www.deviantart.com/users/login',
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Continue to DeviantArt' }));
  const input = await screen.findByLabelText('Authorization response URL');
  await user.type(input, 'https://www.deviantart.com/');
  await user.click(screen.getByRole('button', { name: 'Finish connection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(DEVIANTART_OAUTH.homepageMessage);
  expect(input).toHaveValue('');
  expect(screen.getByLabelText('Full authorization URL')).toHaveValue(AUTHORIZATION_URL);
  await user.type(input, 'old-private-response');
  await user.click(screen.getByRole('button', { name: 'Start a new sign-in' }));
  await waitFor(() => expect(screen.getByLabelText('Full authorization URL')).toHaveValue(fresh.href));
  expect(screen.getByRole('link', { name: 'Open DeviantArt sign-in' })).toHaveAttribute('href', fresh.href);
  expect(input).toHaveValue('');
});

it('rejects incomplete sign-in links instead of rendering a provider homepage button', async () => {
  const user = userEvent.setup();
  mockStation(true, 'copy');
  const implementation = vi.mocked(requestApi).getMockImplementation()!;
  vi.mocked(requestApi).mockImplementation(async (endpoint, options) =>
    endpoint.endsWith('/start')
      ? { authorizationUrl: 'https://www.deviantart.com/', returnMode: 'copy' }
      : implementation(endpoint, options),
  );
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Continue to DeviantArt' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The authorization link is incomplete or invalid.');
  expect(screen.queryByRole('link', { name: 'Open DeviantArt sign-in' })).not.toBeInTheDocument();
});

it('shows the HTTP response step before app setup and enables it only after a valid start', async () => {
  const user = userEvent.setup();
  mockStation(false, 'copy');
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  const input = await screen.findByLabelText('Authorization response URL');
  expect(input).toBeVisible();
  expect(input).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Finish connection' })).toBeDisabled();
  expect(screen.getByText(/Save your client ID and secret in One-time app setup/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeDisabled();
  expect(screen.queryByLabelText('Full authorization URL')).not.toBeInTheDocument();
});

it('keeps the response step visible and disabled when a fresh HTTP sign-in fails', async () => {
  const user = userEvent.setup();
  mockStation(true, 'copy');
  let starts = 0;
  const implementation = vi.mocked(requestApi).getMockImplementation()!;
  vi.mocked(requestApi).mockImplementation(async (endpoint, options) => {
    if (endpoint.endsWith('/start')) {
      starts += 1;
      if (starts !== 1) {
        throw new Error('Pause DeviantArt downloads before connecting the account.');
      }
    }
    return implementation(endpoint, options);
  });
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue to DeviantArt' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Continue to DeviantArt' }));
  const input = screen.getByLabelText('Authorization response URL');
  await user.type(input, 'private-old-response');
  await user.click(screen.getByRole('button', { name: 'Start a new sign-in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Pause DeviantArt downloads');
  expect(input).toBeVisible();
  expect(input).toBeDisabled();
  expect(input).toHaveValue('');
  expect(screen.getByText(/Choose Continue to DeviantArt or Reconnect DeviantArt above/)).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Open DeviantArt sign-in' })).not.toBeInTheDocument();
});

it('restores saved connection status after a page remount without starting OAuth again', async () => {
  const user = userEvent.setup();
  mockStation(true, 'copy');
  const implementation = vi.mocked(requestApi).getMockImplementation()!;
  vi.mocked(requestApi).mockImplementation(async (endpoint, options) =>
    endpoint === DEVIANTART.path
      ? { ...snapshot, hasAccount: true, customClient: true }
      : implementation(endpoint, options),
  );
  const first = render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  expect(await screen.findByText('DeviantArt account saved on this station')).toBeVisible();
  first.unmount();
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  expect(await screen.findByText('DeviantArt account saved on this station')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reconnect DeviantArt' })).toBeEnabled();
  expect(screen.getByLabelText('DeviantArt refresh token')).toHaveValue('');
  expect(screen.getByText(/Saved credentials survive page reloads/)).toBeVisible();
  expect(screen.getByText(/Browser verification is separate from OAuth/)).toBeVisible();
  expect(vi.mocked(requestApi).mock.calls.some(([endpoint]) => endpoint.endsWith('/start'))).toBe(false);
});

it('distinguishes a failed account read from disconnection and recovers without removing credentials', async () => {
  const user = userEvent.setup();
  mockStation(true, 'copy');
  let offline = true;
  const implementation = vi.mocked(requestApi).getMockImplementation()!;
  vi.mocked(requestApi).mockImplementation(async (endpoint, options) => {
    if (endpoint === DEVIANTART.path) {
      if (offline) {
        throw new Error('Network unavailable');
      }
      return { ...snapshot, hasAccount: true };
    }
    return implementation(endpoint, options);
  });
  render(<DeviantartSettings />);
  await user.click(screen.getByText('DeviantArt collections & account'));
  expect(await screen.findByText(/Account status could not be confirmed/)).toBeVisible();
  expect(screen.queryByText('No DeviantArt account saved on this station')).not.toBeInTheDocument();
  await user.click(screen.getByText('DeviantArt collections & account'));
  offline = false;
  await user.click(screen.getByText('DeviantArt collections & account'));
  expect(await screen.findByText('DeviantArt account saved on this station')).toBeVisible();
  expect(screen.queryByText(/Account status could not be confirmed/)).not.toBeInTheDocument();
  expect(vi.mocked(requestApi).mock.calls.every(([_endpoint, options]) => options?.method !== 'POST')).toBe(true);
});
