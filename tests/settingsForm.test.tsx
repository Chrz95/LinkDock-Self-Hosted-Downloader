// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { StationSettings } from '../src/features/settings/StationSettings';
import { TransferControls } from '../src/features/downloads/components/TransferControls';
import { DEFAULT_POLICY } from '../shared/policy';
import { API_PATH, DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { requestApi } from '../src/lib/api/requestApi';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.mocked(requestApi).mockReset();
});

it('edits and saves station-wide limits without losing the draft to polling updates', async () => {
  const user = userEvent.setup();
  const saved = { ...DEFAULT_POLICY, downloadKibPerSecond: 512 };
  vi.mocked(requestApi).mockResolvedValue(saved);
  const view = render(<StationSettings policy={{ settings: DEFAULT_POLICY, holdReason: null }} />);
  await user.click(screen.getByText('Station controls'));
  const downloadRate = screen.getByRole('spinbutton', { name: /Download limit/ });
  await user.clear(downloadRate);
  await user.type(downloadRate, '512');
  view.rerender(<StationSettings policy={{ settings: { ...DEFAULT_POLICY }, holdReason: null }} />);
  expect(downloadRate).toHaveValue(saved.downloadKibPerSecond);
  await user.click(screen.getByRole('button', { name: 'Save preferences' }));
  expect(requestApi).toHaveBeenCalledWith(API_PATH.settings, {
    method: 'POST',
    body: JSON.stringify(saved),
  });
  expect(screen.getByText('Saved on your station.')).toBeInTheDocument();
});

it('shows policy errors and exposes the current hold even before the controls are expanded', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockRejectedValue(new Error('The timezone is invalid.'));
  render(<StationSettings policy={{ settings: DEFAULT_POLICY, holdReason: 'Waiting for free disk space' }} />);
  expect(screen.getByText('Station controls').closest('summary')).toHaveTextContent('Waiting for free disk space');
  await user.click(screen.getByText('Station controls'));
  await user.click(screen.getByRole('button', { name: 'Save preferences' }));
  expect(screen.getByRole('alert')).toHaveTextContent('timezone');
});

it('distinguishes resume from discarding partial data when operating a paused download', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn().mockResolvedValue(undefined);
  const job: DownloadJob = {
    id: 'job-id',
    url: 'https://example.com/file',
    filename: 'file.zip',
    status: DOWNLOAD_STATUS.paused,
    receivedBytes: 1,
    totalBytes: null,
    bytesPerSecond: 0,
    createdAt: '',
    finishedAt: null,
    errorMessage: null,
  };
  render(
    <TransferControls
      job={job}
      isBusy={false}
      onAction={onAction}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Resume file.zip' }));
  expect(onAction).toHaveBeenLastCalledWith(job.id, 'resume');
  await user.click(screen.getByRole('button', { name: 'Restart file.zip from the beginning' }));
  expect(onAction).toHaveBeenLastCalledWith(job.id, 'retry');
});
