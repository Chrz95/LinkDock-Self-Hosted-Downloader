// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadRetryInfo } from '../src/features/downloads/components/library/DownloadRetryInfo';
import { StationSettings } from '../src/features/settings/StationSettings';
import { requestApi } from '../src/lib/api/requestApi';
import { DEFAULT_POLICY } from '../shared/policy';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.mocked(requestApi).mockReset();
});
const job: DownloadJob = {
  id: 'fixture',
  url: 'https://source.example/file',
  filename: 'File',
  status: DOWNLOAD_STATUS.queued,
  receivedBytes: 0,
  totalBytes: null,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: null,
  errorMessage: null,
  retry: {
    attempts: 1,
    nextAttemptAt: '2026-10-27T10:00:30Z',
    cooldownUntil: '2026-10-27T10:00:30Z',
    reason: 'network',
  },
};

it('explains scheduled retry, pause, recovery and exhausted-budget states without sending requests', () => {
  const view = render(<DownloadRetryInfo job={job} />);
  expect(screen.getByText(/Automatic retry 1\/3/)).toBeVisible();
  expect(screen.getByText(/Pause or cancel/)).toBeVisible();
  view.rerender(<DownloadRetryInfo job={{ ...job, status: DOWNLOAD_STATUS.paused }} />);
  expect(screen.getByText(/Automatic retries are paused/)).toBeVisible();
  view.rerender(<DownloadRetryInfo job={{ ...job, status: DOWNLOAD_STATUS.completed }} />);
  expect(screen.getByText('Recovered after 1 automatic retry.')).toBeVisible();
  const exhaustedAttempts = 3;
  view.rerender(
    <DownloadRetryInfo
      job={{
        ...job,
        status: DOWNLOAD_STATUS.failed,
        retry: { ...job.retry!, attempts: exhaustedAttempts, nextAttemptAt: null },
      }}
    />,
  );
  expect(screen.getByText(/Automatic retry limit reached/)).toBeVisible();
  expect(requestApi).not.toHaveBeenCalled();
});

it('allows disabling automatic retries through the existing station preferences form', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockImplementation(async (_url, options) => JSON.parse(String(options?.body)));
  render(<StationSettings policy={{ settings: DEFAULT_POLICY, holdReason: null }} />);
  await user.click(screen.getByText('Download defaults'));
  const toggle = screen.getByRole('checkbox', { name: 'Retry temporary failures automatically' });
  expect(toggle).toBeChecked();
  await user.click(toggle);
  await user.click(screen.getByRole('button', { name: 'Save preferences' }));
  expect(JSON.parse(vi.mocked(requestApi).mock.calls.at(-1)![1]!.body as string).automaticRetries).toBe(false);
});
