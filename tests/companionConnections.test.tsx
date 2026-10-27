// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { CompanionConnections } from '../src/features/settings/CompanionConnections';
import { requestApi } from '../src/lib/api/requestApi';
import { COMPANION } from '../shared/companion';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const connection = { id: 'example-id', createdAt: '2026-10-27T09:00:00Z', expiresAt: '2027-01-25T09:00:00Z' };
afterEach(() => {
  cleanup();
  vi.mocked(requestApi).mockReset();
});

it('loads only when opened and revokes a selected companion independently of source sessions', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi)
    .mockResolvedValueOnce({ connections: [connection] })
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ connections: [] });
  render(<CompanionConnections />);
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(screen.getByText('Browser companions'));
  await user.click(await screen.findByRole('button', { name: 'Revoke companion' }));
  expect(await screen.findByText('No active companion connections.')).toBeVisible();
  expect(requestApi).toHaveBeenCalledWith(`${COMPANION.path}/${connection.id}`, { method: 'DELETE', body: '{}' });
  expect(vi.mocked(requestApi).mock.calls.every(([endpoint]) => endpoint.startsWith(COMPANION.path))).toBe(true);
});

it('retains the existing connection after a failed revocation and aborts a closed view refresh', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi)
    .mockResolvedValueOnce({ connections: [connection] })
    .mockRejectedValueOnce(new Error('offline'));
  render(<CompanionConnections />);
  await user.click(screen.getByText('Browser companions'));
  await user.click(await screen.findByRole('button', { name: 'Revoke companion' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not revoke');
  expect(screen.getByRole('button', { name: 'Revoke companion' })).toBeVisible();
  vi.mocked(requestApi).mockImplementation(() => new Promise(() => undefined));
  await user.click(screen.getByRole('button', { name: 'Refresh companions' }));
  const signal = vi.mocked(requestApi).mock.calls.at(-1)?.[1]?.signal;
  await user.click(screen.getByText('Browser companions'));
  expect(signal?.aborted).toBe(true);
});
