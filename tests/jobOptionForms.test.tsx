// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { TorrentSelection } from '../src/features/downloads/components/library/TorrentSelection';
import { CompletionDestination } from '../src/features/downloads/components/library/CompletionDestination';
import { requestApi } from '../src/lib/api/requestApi';
import type { DownloadJob } from '../shared/contracts';
import { JOB_OPTIONS } from '../shared/jobOptions';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const SECOND_INDEX = 2;
const SIZE = 3;
const job: DownloadJob = {
  id: '299c97d0-07dc-45b7-8533-aa21083bd905',
  url: 'https://example.com/example.torrent',
  filename: 'Example torrent',
  sourceType: 'torrent',
  status: 'paused',
  receivedBytes: 0,
  totalBytes: null,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: null,
  errorMessage: null,
  torrentSelection: {
    files: [
      { index: 1, name: 'large.bin', sizeBytes: SIZE },
      { index: SECOND_INDEX, name: 'folder/chosen.mp4', sizeBytes: SIZE },
    ],
  },
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('requires an explicit nonempty selection and sends only checked engine indexes', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockResolvedValue(undefined);
  render(<TorrentSelection job={job} />);
  const submit = screen.getByRole('button', { name: 'Download selected files' });
  expect(submit).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: /folder\/chosen.mp4/u }));
  await user.click(submit);
  expect(requestApi).toHaveBeenCalledWith(expect.stringContaining(JOB_OPTIONS.torrent), {
    method: 'POST',
    body: JSON.stringify({ indexes: [SECOND_INDEX] }),
  });
  expect(await screen.findByText('File selection saved. Download queued.')).toBeVisible();
});

it('keeps a rejected selection editable and displays its server error', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockRejectedValue(new Error('Selection exceeds size limit.'));
  render(<TorrentSelection job={job} />);
  await user.click(screen.getByRole('button', { name: 'Select all' }));
  await user.click(screen.getByRole('button', { name: 'Download selected files' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('size limit');
  expect(screen.getAllByRole('checkbox').every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByRole('button', { name: 'Download selected files' })).toBeDisabled();
});

it('submits a relative physical destination and preserves rejected edits', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockRejectedValueOnce(new Error('Disk full.')).mockResolvedValueOnce(undefined);
  render(<CompletionDestination job={job} />);
  await user.click(screen.getByText('Move on completion'));
  const input = screen.getByRole('textbox', { name: 'Destination folder' });
  await user.type(input, 'Media/Trips');
  await user.click(screen.getByRole('button', { name: 'Save destination' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
  expect(input).toHaveValue('Media/Trips');
  await user.click(screen.getByRole('button', { name: 'Save destination' }));
  expect(requestApi).toHaveBeenLastCalledWith(expect.stringContaining(JOB_OPTIONS.destination), {
    method: 'POST',
    body: JSON.stringify({ directory: 'Media/Trips' }),
  });
  expect(await screen.findByText('Completion destination saved.')).toBeVisible();
});
