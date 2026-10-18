// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { StationHealth } from '../src/features/health/StationHealth';
import { requestApi } from '../src/lib/api/requestApi';
import { API_PATH } from '../shared/contracts';
import { ENGINE_STATE, type StationHealthSnapshot } from '../shared/health';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const MEMORY_BYTES = 1_024;
const UPTIME_SECONDS = 3_661;
const snapshot: StationHealthSnapshot = {
  checkedAt: '2026-10-18T10:00:00Z',
  runtime: {
    node: 'v24.19.0',
    platform: 'linux',
    architecture: 'arm64',
    uptimeSeconds: UPTIME_SECONDS,
    memoryBytes: MEMORY_BYTES,
  },
  storage: {
    availableBytes: MEMORY_BYTES,
    totalBytes: MEMORY_BYTES,
    writable: true,
    detail: 'Permissions allow writes.',
  },
  queue: { active: 1, waiting: 0, paused: 0, holdReason: 'Waiting for disk space' },
  engines: [
    {
      id: 'video',
      label: 'Site videos',
      state: ENGINE_STATE.missing,
      version: null,
      detail: 'Engine missing. Rebuild the Docker image.',
      checkedAt: '2026-10-18T10:00:00Z',
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.mocked(requestApi).mockReset();
});

it('loads only on opening, shows real diagnostics and retains old data after a failed explicit refresh', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockResolvedValue(snapshot);
  render(<StationHealth />);
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(screen.getByText('Station health'));
  expect(await screen.findByText('Node v24.19.0')).toBeVisible();
  expect(screen.getByText('linux / arm64')).toBeVisible();
  expect(screen.getByText('1h 1m')).toBeVisible();
  expect(screen.getByText('Engine missing. Rebuild the Docker image.')).toBeVisible();
  expect(screen.getByText('Queue hold: Waiting for disk space')).toBeVisible();
  expect(requestApi).toHaveBeenCalledWith(API_PATH.station, { signal: expect.any(AbortSignal) });
  vi.mocked(requestApi).mockRejectedValueOnce(new Error('Offline'));
  await user.click(screen.getByRole('button', { name: 'Refresh status' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Previous results may be out of date');
  expect(screen.getByText('Node v24.19.0')).toBeVisible();
});

it('aborts an in-flight view request when closed without displaying a late result', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockImplementation(() => new Promise(() => undefined));
  render(<StationHealth />);
  await user.click(screen.getByText('Station health'));
  await waitFor(() => expect(requestApi).toHaveBeenCalledTimes(1));
  const [, options] = vi.mocked(requestApi).mock.calls[0]!;
  await user.click(screen.getByText('Station health'));
  await waitFor(() => expect(options!.signal!.aborted).toBe(true));
  expect(screen.queryByRole('button', { name: 'Checking station…' })).not.toBeInTheDocument();
});
