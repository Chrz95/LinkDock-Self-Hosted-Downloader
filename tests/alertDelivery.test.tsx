// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AlertDelivery } from '../src/features/mobile/AlertDelivery';
import { requestApi } from '../src/lib/api/requestApi';
import { API_PATH, HTTP_METHOD } from '../shared/contracts';
import { NOTIFICATION_PATH, type AlertDeliveryStatus } from '../shared/notifications';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const ENDPOINT = `${API_PATH.notifications}${NOTIFICATION_PATH.outbox}`;
const snapshot: AlertDeliveryStatus = {
  available: true,
  pending: 1,
  retrying: 1,
  sending: 0,
  nextAttemptAt: '2026-10-18T12:01:00Z',
  reason: null,
};
afterEach(() => {
  cleanup();
  vi.mocked(requestApi).mockReset();
});

it('loads aggregate status only when opened, refreshes explicitly and never requests alert permission', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockResolvedValue(snapshot);
  render(<AlertDelivery />);
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(screen.getByText('Alert delivery · all registered devices'));
  expect(await screen.findByText('Pending deliveries')).toBeVisible();
  const term = screen.getByText('Pending deliveries').parentElement!;
  expect(within(term).getByText('1')).toBeVisible();
  expect(requestApi).toHaveBeenCalledWith(ENDPOINT, { signal: expect.any(AbortSignal) });
  expect(screen.getByText(/Provider acceptance does not guarantee/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Refresh delivery status' }));
  const twoRequests = 2;
  expect(requestApi).toHaveBeenCalledTimes(twoRequests);
});

it('retains a marked previous snapshot on refresh failure and exposes unavailable storage clearly', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error('Station offline'));
  render(<AlertDelivery />);
  await user.click(screen.getByText('Alert delivery · all registered devices'));
  await screen.findByText('Pending deliveries');
  await user.click(screen.getByRole('button', { name: 'Refresh delivery status' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Station offline');
  expect(screen.getByText('Pending deliveries')).toBeVisible();
  expect(screen.getByText(/Snapshot at/)).toBeVisible();
  vi.mocked(requestApi).mockResolvedValueOnce({
    ...snapshot,
    available: false,
    reason: 'Check station storage and restart.',
  });
  await user.click(screen.getByRole('button', { name: 'Refresh delivery status' }));
  expect(await screen.findByText('Check station storage and restart.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Clear pending alerts' })).toBeDisabled();
});

it('clears only through an explicit protected DELETE and refreshes counts without sending test alerts', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi)
    .mockResolvedValueOnce(snapshot)
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ ...snapshot, pending: 0, retrying: 0, nextAttemptAt: null });
  render(<AlertDelivery />);
  await user.click(screen.getByText('Alert delivery · all registered devices'));
  await screen.findByText('Pending deliveries');
  await user.click(screen.getByRole('button', { name: 'Clear pending alerts' }));
  expect(requestApi).toHaveBeenCalledWith(ENDPOINT, { method: HTTP_METHOD.delete, body: '{}' });
  expect(await screen.findByText('None pending')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Clear pending alerts' })).toBeDisabled();
  expect(screen.getByText(/Pending alerts cleared/)).toBeVisible();
  expect(vi.mocked(requestApi).mock.calls.every(([url]) => url === ENDPOINT)).toBe(true);
});

it('leaves previous counts and explicit error feedback after a rejected clear', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi)
    .mockResolvedValueOnce(snapshot)
    .mockRejectedValueOnce(new Error('Pending alerts could not be cleared'));
  render(<AlertDelivery />);
  await user.click(screen.getByText('Alert delivery · all registered devices'));
  await screen.findByText('Pending deliveries');
  await user.click(screen.getByRole('button', { name: 'Clear pending alerts' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be cleared');
  expect(screen.getByText('Pending deliveries')).toBeVisible();
});

it('aborts pending setup on close and ignores late results', async () => {
  const user = userEvent.setup();
  let resolve: ((value: AlertDeliveryStatus) => void) | undefined;
  vi.mocked(requestApi).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<AlertDelivery />);
  await user.click(screen.getByText('Alert delivery · all registered devices'));
  await waitFor(() => expect(requestApi).toHaveBeenCalledTimes(1));
  const [, options] = vi.mocked(requestApi).mock.calls[0]!;
  await user.click(screen.getByText('Alert delivery · all registered devices'));
  await waitFor(() => expect(options?.signal?.aborted).toBe(true));
  await act(async () => {
    resolve?.(snapshot);
  });
  expect(screen.queryByText('Pending deliveries')).not.toBeInTheDocument();
});

it('reloads after a rapid reopen and ignores an older aborted response', async () => {
  const user = userEvent.setup();
  let resolve: ((value: AlertDeliveryStatus) => void) | undefined;
  vi.mocked(requestApi)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce(snapshot);
  render(<AlertDelivery />);
  const summary = screen.getByText('Alert delivery · all registered devices');
  await user.click(summary);
  await waitFor(() => expect(requestApi).toHaveBeenCalledTimes(1));
  await user.click(summary);
  await user.click(summary);
  expect(await screen.findByText('Pending deliveries')).toBeVisible();
  const staleCount = 99;
  await act(async () => {
    resolve?.({ ...snapshot, pending: staleCount });
  });
  expect(screen.queryByText(String(staleCount))).not.toBeInTheDocument();
});
