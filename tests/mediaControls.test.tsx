// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { CompletedFiles } from '../src/features/downloads/components/files/CompletedFiles';
import { MediaPreview } from '../src/features/downloads/components/files/MediaPreview';
import { ArchiveDownload } from '../src/features/downloads/components/files/ArchiveDownload';
import {
  API_PATH,
  DOWNLOAD_PATH,
  DOWNLOAD_STATUS,
  HTTP_METHOD,
  HTTP_STATUS,
  type DownloadJob,
} from '../shared/contracts';
import { DELIVERY_LIMIT } from '../shared/media';

const FILE_BYTES = 128;
const job: DownloadJob = {
  id: '2973533c-346f-49cf-9c9e-378378d820f8',
  url: 'https://source.example/private?token=do-not-request',
  filename: 'photo.png',
  status: DOWNLOAD_STATUS.completed,
  receivedBytes: FILE_BYTES,
  totalBytes: FILE_BYTES,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: '',
  errorMessage: null,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('loads nothing before an explicit preview click and removes the image again when closed', async () => {
  const user = userEvent.setup();
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: HTTP_STATUS.ok }));
  vi.stubGlobal('fetch', fetch);
  render(<CompletedFiles job={job} />);
  expect(fetch).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Preview photo.png' }));
  const image = await screen.findByRole('img', { name: 'photo.png' });
  expect(image).toHaveAttribute('src', `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.preview}`);
  expect(fetch).toHaveBeenCalledWith(`${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.preview}`, {
    method: HTTP_METHOD.head,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: expect.any(AbortSignal),
  });
  expect(screen.getByRole('link', { name: 'Save original' })).toHaveAttribute(
    'href',
    `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.file}`,
  );
  await user.click(screen.getByRole('button', { name: 'Close preview for photo.png' }));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not offer previews for unfinished jobs, active documents or oversized raster files', () => {
  const view = render(<CompletedFiles job={{ ...job, status: DOWNLOAD_STATUS.downloading }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  view.rerender(<CompletedFiles job={{ ...job, filename: 'vector.svg' }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  view.rerender(<CompletedFiles job={{ ...job, receivedBytes: DELIVERY_LIMIT.maximumImageBytes + 1 }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('uses quiet native video controls and provides a save fallback when browser decoding fails', async () => {
  const user = userEvent.setup();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: HTTP_STATUS.ok })));
  render(<CompletedFiles job={{ ...job, filename: 'clip.mp4' }} />);
  await user.click(screen.getByRole('button', { name: 'Preview clip.mp4' }));
  const video = await screen.findByLabelText('Video preview for clip.mp4');
  expect(video).toHaveAttribute('controls');
  expect(video).toHaveAttribute('playsinline');
  expect(video).toHaveAttribute('preload', 'metadata');
  expect((video as HTMLVideoElement).muted).toBe(true);
  expect(video).not.toHaveAttribute('autoplay');
  fireEvent.error(video);
  expect(screen.getByRole('alert')).toHaveTextContent('could not display');
  expect(screen.getByRole('link', { name: 'Save file' })).toBeVisible();
});

it('keeps a rejected preview error inline and cancels a pending preflight when the row unmounts', async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: HTTP_STATUS.unsupportedMediaType }))
    .mockImplementationOnce(() => new Promise(() => undefined));
  vi.stubGlobal('fetch', fetch);
  const view = render(
    <MediaPreview
      jobId={job.id}
      filename="photo.png"
      sizeBytes={FILE_BYTES}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Preview photo.png' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('cannot be previewed');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Preview photo.png' }));
  const twoRequests = 2;
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(twoRequests));
  const last = fetch.mock.calls.at(-1)!;
  view.unmount();
  expect(last[1].signal.aborted).toBe(true);
});

it('uses manifest indices for carousel previews and includes an archive action', async () => {
  const user = userEvent.setup();
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: HTTP_STATUS.ok }));
  vi.stubGlobal('fetch', fetch);
  const files = [
    { name: 'photo.png', relativePath: 'photo.png', sizeBytes: FILE_BYTES },
    { name: 'clip.mp4', relativePath: 'clip.mp4', sizeBytes: FILE_BYTES },
  ];
  render(<CompletedFiles job={{ ...job, files }} />);
  await user.click(screen.getByText('View 2 files'));
  expect(screen.getByRole('button', { name: 'Save all as ZIP' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Preview photo.png' }));
  expect(await screen.findByRole('img')).toHaveAttribute(
    'src',
    `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.preview}/0`,
  );
  expect(screen.getByRole('link', { name: 'Save photo.png to this device' })).toHaveAttribute(
    'href',
    `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.files}/0`,
  );
});

it('checks archive errors inline before handing a successful URL to the native download manager', async () => {
  const user = userEvent.setup();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: HTTP_STATUS.tooManyRequests }))
    .mockResolvedValueOnce(new Response(null, { status: HTTP_STATUS.ok }));
  vi.stubGlobal('fetch', fetch);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  render(<ArchiveDownload jobId={job.id} />);
  await user.click(screen.getByRole('button', { name: 'Save all as ZIP' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Two ZIP downloads');
  expect(click).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save all as ZIP' }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  const anchor = click.mock.instances[0] as HTMLAnchorElement;
  expect(anchor).toHaveAttribute('href', `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.archive}`);
  expect(anchor).toHaveAttribute('download');
  expect(screen.getByText(/Your browser manages/)).toBeVisible();
});
