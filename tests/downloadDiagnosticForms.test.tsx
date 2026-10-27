// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DownloadDiagnostics } from '../src/features/downloads/components/library/DownloadDiagnostics';
import { requestApi } from '../src/lib/api/requestApi';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import type { DownloadDiagnostic } from '../shared/diagnostics';
import { SOURCE_TYPE } from '../shared/sources';

vi.mock('../src/lib/api/requestApi', () => ({ requestApi: vi.fn() }));
const job: DownloadJob = {
  id: 'example-id',
  url: 'https://source.example/item?token=private-value',
  filename: 'Private title',
  status: DOWNLOAD_STATUS.failed,
  sourceType: SOURCE_TYPE.deviantart,
  receivedBytes: 0,
  totalBytes: null,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: null,
  errorMessage: null,
};
const report: DownloadDiagnostic = {
  diagnostic: 'LD-DOWNLOAD-1',
  checkedAt: '2026-10-27T09:00:00Z',
  dnsMode: 'cloudflare',
  sourceType: SOURCE_TYPE.deviantart,
  previousFailure: 'verification',
  checks: [
    {
      id: 'source',
      label: 'Source response',
      state: 'failed',
      detail: 'HTTP 403: a CloudFront block page was returned.',
      action: 'source',
    },
  ],
};
beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:report') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.mocked(requestApi).mockReset();
});

it('runs only on demand, renders actionable results and exports the report without the job URL or title', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockResolvedValue(report);
  const view = render(<DownloadDiagnostics job={job} />);
  expect(requestApi).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Test connection' }));
  expect(await screen.findByRole('region', { name: 'Connection check results' })).toBeVisible();
  expect(screen.getByText(/CloudFront block/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Check original source' })).toHaveAttribute('href', job.url);
  await user.click(screen.getByRole('button', { name: 'Download diagnostic report' }));
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob;
  const reader = new FileReader();
  const contents = new Promise<string>((resolve) => {
    reader.onload = () => resolve(String(reader.result));
  });
  reader.readAsText(blob);
  expect(JSON.parse(await contents)).toEqual(report);
  expect(JSON.stringify(report)).not.toMatch(/private-value|Private title|source\.example/);
  expect(requestApi).toHaveBeenCalledWith('/api/downloads/example-id/diagnostic', {
    method: 'POST',
    body: '{}',
    signal: expect.any(AbortSignal),
  });
  view.unmount();
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report'));
});

it('prevents duplicate checks and aborts in-flight work when the item unmounts', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockImplementation(() => new Promise(() => undefined));
  const view = render(<DownloadDiagnostics job={job} />);
  await user.click(screen.getByRole('button', { name: 'Test connection' }));
  const button = screen.getByRole('button', { name: 'Checking connection…' });
  expect(button).toBeDisabled();
  await user.click(button);
  expect(requestApi).toHaveBeenCalledOnce();
  const signal = vi.mocked(requestApi).mock.calls[0]![1]!.signal!;
  view.unmount();
  expect(signal.aborted).toBe(true);
});

it('allows retry after an API error and never starts checks for active jobs or torrents', async () => {
  const user = userEvent.setup();
  vi.mocked(requestApi).mockRejectedValueOnce(new Error('Your station session expired.')).mockResolvedValue(report);
  const view = render(<DownloadDiagnostics job={job} />);
  await user.click(screen.getByRole('button', { name: 'Test connection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('session expired');
  await user.click(screen.getByRole('button', { name: 'Test connection' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  view.rerender(<DownloadDiagnostics job={{ ...job, status: DOWNLOAD_STATUS.downloading }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  view.rerender(<DownloadDiagnostics job={{ ...job, sourceType: SOURCE_TYPE.torrent }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
