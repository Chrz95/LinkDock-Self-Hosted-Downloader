// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { UtilityUpdates } from '../src/features/utilities/UtilityUpdates';
import { requestApi } from '../src/lib/api/requestApi';
import { UTILITY, UTILITY_ACTION, type UtilitySnapshot } from '../shared/utilities';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const snapshot: UtilitySnapshot = {
  enabled: false,
  requested: false,
  status: 'idle',
  message: 'Bundled tools available.',
  checkedAt: null,
  updatedAt: null,
  versions: {},
  usingManagedTools: false,
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('loads lazily and saves a strict automatic-update preference through the private API', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi)
    .mockResolvedValueOnce(snapshot)
    .mockResolvedValueOnce({ ...snapshot, enabled: true });
  render(<UtilityUpdates />);
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(screen.getByText('Download utility updates'));
  const checkbox = await screen.findByRole('checkbox', { name: 'Automatically check daily when idle' });
  await user.click(checkbox);
  expect(requestApi).toHaveBeenLastCalledWith(UTILITY.path, {
    method: 'POST',
    body: JSON.stringify({ action: UTILITY_ACTION.settings, enabled: true }),
  });
  await waitFor(() => expect(checkbox).toBeChecked());
});
it(
  'queues fixed update actions, shows waiting state and allows ' + 'cancellation without losing current tools',
  async () => {
    const user = userEvent.setup();
    vi.mocked(requestApi)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ ...snapshot, requested: true, status: 'waiting', message: 'Waiting for downloads.' })
      .mockResolvedValueOnce({ ...snapshot, message: 'Update canceled.' });
    render(<UtilityUpdates />);
    await user.click(screen.getByText('Download utility updates'));
    await user.click(await screen.findByRole('button', { name: 'Check & update now' }));
    expect(await screen.findByText('Waiting for downloads.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check & update now' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel update' }));
    expect(requestApi).toHaveBeenLastCalledWith(UTILITY.path, {
      method: 'POST',
      body: JSON.stringify({ action: UTILITY_ACTION.cancel }),
    });
    expect(await screen.findByText('Update canceled.')).toBeVisible();
  },
);
