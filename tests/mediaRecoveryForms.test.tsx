// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MediaVersion } from '../src/features/downloads/components/library/MediaVersion';
import { MediaRecovery } from '../src/features/downloads/components/library/MediaRecovery';
import { BrowserAssistance } from '../src/features/downloads/components/library/BrowserAssistance';
import { requestApi } from '../src/lib/api/requestApi';
import { API_PATH, DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { SOURCE_TYPE, VIDEO_QUALITY } from '../shared/sources';
import { JOB_OPTIONS } from '../shared/jobOptions';
import { MEDIA_FAILURE } from '../shared/mediaFailures';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const job: DownloadJob = {
  id: 'job-id',
  url: 'https://youtu.be/offline',
  filename: 'Offline video',
  sourceType: SOURCE_TYPE.video,
  quality: VIDEO_QUALITY.compact,
  status: DOWNLOAD_STATUS.completed,
  receivedBytes: 1,
  totalBytes: 1,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: null,
  errorMessage: null,
};
afterEach(() => {
  cleanup();
  vi.mocked(requestApi).mockReset();
});

it('shows a retained quality ceiling and explicitly queues MP3 as another download', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockResolvedValue({ id: 'copy-id' });
  render(<MediaVersion job={job} />);
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(screen.getByText('Download another version'));
  expect(screen.getByText('Current request: Video · up to 720p')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Queue this version' })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('Output format'), 'mp3');
  await user.selectOptions(screen.getByLabelText('Audio quality'), 'mp3-320');
  await user.click(screen.getByRole('button', { name: 'Queue this version' }));
  await waitFor(() =>
    expect(requestApi).toHaveBeenCalledWith(`${API_PATH.downloads}/${job.id}${JOB_OPTIONS.mediaCopy}`, {
      method: 'POST',
      body: JSON.stringify({ quality: 'mp3-320' }),
    }),
  );
  expect(
    await screen.findByText('New version queued from the original source. Existing download retained.'),
  ).toBeVisible();
  expect(job.quality).toBe(VIDEO_QUALITY.compact);
});

it('allows a failed source to queue its current quality and preserves a rejected choice', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockRejectedValue(new Error('This download is already queued or saved in your library.'));
  render(<MediaVersion job={{ ...job, status: DOWNLOAD_STATUS.failed }} />);
  await user.click(screen.getByText('Download another version'));
  expect(screen.getByRole('button', { name: 'Queue this version' })).toBeEnabled();
  await user.selectOptions(screen.getByLabelText('Video quality'), 'best');
  await user.click(screen.getByRole('button', { name: 'Queue this version' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already queued or saved');
  expect(screen.getByLabelText('Video quality')).toHaveValue('best');
});

it('does not offer video variants for direct files, torrents or galleries', () => {
  for (const sourceType of [SOURCE_TYPE.direct, SOURCE_TYPE.torrent, SOURCE_TYPE.deviantart]) {
    const view = render(<MediaVersion job={{ ...job, sourceType }} />);
    expect(screen.queryByText('Download another version')).not.toBeInTheDocument();
    view.unmount();
  }
});

it('gives rate-limit and format recovery distinct guidance without auto-requesting a download', () => {
  const view = render(
    <MediaRecovery job={{ ...job, status: DOWNLOAD_STATUS.failed, mediaFailure: MEDIA_FAILURE.rate }} />,
  );
  expect(screen.getByText('Source request limit')).toBeVisible();
  expect(screen.getByText(/Wait before restarting/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open source settings' })).toHaveAttribute('href', '#settings');
  view.rerender(<MediaRecovery job={{ ...job, status: DOWNLOAD_STATUS.failed, mediaFailure: MEDIA_FAILURE.format }} />);
  expect(screen.getByText('Requested quality unavailable')).toBeVisible();
  expect(screen.getByText(/Try Best available/)).toBeVisible();
  expect(requestApi).not.toHaveBeenCalled();
});

it('keeps DRM/format failures out of CAPTCHA handoff and leaves unclassified legacy errors supported', () => {
  const failed = { ...job, status: DOWNLOAD_STATUS.failed };
  const view = render(<BrowserAssistance job={{ ...failed, mediaFailure: MEDIA_FAILURE.drm }} />);
  expect(screen.queryByText('Browser assistance')).not.toBeInTheDocument();
  view.rerender(<BrowserAssistance job={{ ...failed, mediaFailure: MEDIA_FAILURE.format }} />);
  expect(screen.queryByText('Browser assistance')).not.toBeInTheDocument();
  view.rerender(<BrowserAssistance job={failed} />);
  expect(screen.getByText('Browser assistance')).toBeInTheDocument();
  view.rerender(<MediaRecovery job={failed} />);
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
