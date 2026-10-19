// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { JobFiles } from '../src/features/downloads/components/files/JobFiles';
import { CollectionBrowser } from '../src/features/downloads/components/files/CollectionBrowser';
import { CollectionScope } from '../src/features/downloads/components/library/CollectionScope';
import { TransferControls } from '../src/features/downloads/components/TransferControls';
import { API_PATH, DOWNLOAD_PATH, DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { DEVIANTART, defaultDeviantartPreferences } from '../shared/deviantart';
import { SOURCE_TYPE } from '../shared/sources';
import { COLLECTION_PAGE_SIZE, FILE_KIND, fileKind } from '../shared/fileBrowser';

const COUNT = 60;
const LAST_INDEX = COUNT - 1;
const SECOND_PAGE_INDEX = COUNT - COLLECTION_PAGE_SIZE - 1;
const FILE_BYTES = 100;
const MANY_FILES = 2_000;
const files = Array.from({ length: COUNT }, (_unused, index) => ({
  name: `Artist/gallery/photo-${COUNT - index}.png`,
  relativePath: `Artist/gallery/photo-${COUNT - index}.png`,
  sizeBytes: (COUNT - index) * FILE_BYTES,
}));
const job: DownloadJob = {
  id: 'job-id',
  url: 'https://deviantart.com/artist',
  filename: 'Artist collection',
  sourceType: SOURCE_TYPE.deviantart,
  status: DOWNLOAD_STATUS.completed,
  receivedBytes: 1,
  totalBytes: 1,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: '',
  errorMessage: null,
  files,
  deviantart: defaultDeviantartPreferences(),
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('lazily mounts at most one file page for a 2000-item gallery without fetching private files', async () => {
  const user = userEvent.setup();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const many = Array.from({ length: MANY_FILES }, (_unused, index) => ({
    name: `photo-${index}.png`,
    relativePath: `photo-${index}.png`,
    sizeBytes: FILE_BYTES,
  }));
  render(<JobFiles job={{ ...job, files: many }} />);
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryAllByRole('link')).toHaveLength(0);
  await user.click(screen.getByText(`View ${MANY_FILES} files`));
  expect(screen.getAllByRole('link')).toHaveLength(COLLECTION_PAGE_SIZE);
  expect(screen.getByText(`1–${COLLECTION_PAGE_SIZE} of ${MANY_FILES} · ${MANY_FILES} total files`)).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  await user.click(screen.getByText(`View ${MANY_FILES} files`));
  await waitFor(() => expect(screen.queryAllByRole('link')).toHaveLength(0));
});

it('preserves original manifest indexes through natural sorting, paging, searching and size ordering', async () => {
  const user = userEvent.setup();
  render(
    <CollectionBrowser
      jobId={job.id}
      files={files}
    />,
  );
  expect(screen.getByRole('link', { name: 'Save Artist/gallery/photo-1.png to this device' })).toHaveAttribute(
    'href',
    `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.files}/${LAST_INDEX}`,
  );
  await user.click(screen.getByRole('button', { name: 'Next files' }));
  expect(screen.getByRole('link', { name: 'Save Artist/gallery/photo-26.png to this device' })).toHaveAttribute(
    'href',
    `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.files}/${SECOND_PAGE_INDEX}`,
  );
  await user.type(screen.getByRole('searchbox'), 'GALLERY/photo-60');
  expect(screen.getByRole('link', { name: 'Save Artist/gallery/photo-60.png to this device' })).toHaveAttribute(
    'href',
    `${API_PATH.downloads}/${job.id}${DOWNLOAD_PATH.files}/0`,
  );
  expect(screen.getByText('Page 1 of 1')).toBeVisible();
  await user.clear(screen.getByRole('searchbox'));
  await user.selectOptions(screen.getByLabelText('Sort files'), 'largest');
  expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', `${API_PATH.downloads}/${job.id}/files/0`);
  await user.selectOptions(screen.getByLabelText('Sort files'), 'smallest');
  expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', `${API_PATH.downloads}/${job.id}/files/${LAST_INDEX}`);
  expect(files[0]?.name).toBe('Artist/gallery/photo-60.png');
});

it('filters document/story, audio and video families without authorizing active document previews', async () => {
  const user = userEvent.setup();
  const mixed = ['story.TXT', 'story.html', 'clip.mp4', 'audio.mp3', 'graphic.svg', 'bundle.zip'].map((name) => ({
    name,
    relativePath: name,
    sizeBytes: FILE_BYTES,
  }));
  render(
    <CollectionBrowser
      jobId={job.id}
      files={mixed}
    />,
  );
  await user.selectOptions(screen.getByLabelText('File type'), 'document');
  const documents = 2;
  expect(screen.getAllByRole('link')).toHaveLength(documents);
  expect(screen.getByRole('link', { name: 'Save story.html to this device' })).toHaveAttribute(
    'href',
    `${API_PATH.downloads}/${job.id}/files/1`,
  );
  expect(screen.queryByRole('button', { name: /Preview/ })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('File type'), 'audio');
  expect(screen.getByRole('link', { name: 'Save audio.mp3 to this device' })).toBeVisible();
  await user.selectOptions(screen.getByLabelText('File type'), 'video');
  expect(screen.getByRole('link', { name: 'Save clip.mp4 to this device' })).toBeVisible();
  await user.selectOptions(screen.getByLabelText('File type'), 'other');
  expect(screen.getByRole('link', { name: 'Save bundle.zip to this device' })).toBeVisible();
  expect(fileKind('folder.png/README')).toBe(FILE_KIND.other);
  expect(fileKind('artist\\photo.JPEG')).toBe(FILE_KIND.image);
});

it('shows an empty-state recovery and keeps ZIP scoped to the complete collection', async () => {
  const user = userEvent.setup();
  render(<JobFiles job={job} />);
  await user.click(screen.getByText('View 60 files'));
  await user.type(screen.getByRole('searchbox'), 'missing-file');
  expect(screen.getByText(/No matching files/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous files' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next files' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save all as ZIP' })).toBeEnabled();
  expect(screen.getByText('ZIP includes every saved file, regardless of the filters below.')).toBeVisible();
  await user.clear(screen.getByRole('searchbox'));
  expect(screen.getAllByRole('link')).toHaveLength(COLLECTION_PAGE_SIZE);
});

it('aborts a pending preview when pagination removes its row and clamps pages after a manifest change', async () => {
  const user = userEvent.setup();
  const fetch = vi.fn().mockImplementation(() => new Promise(() => undefined));
  vi.stubGlobal('fetch', fetch);
  const view = render(
    <CollectionBrowser
      jobId={job.id}
      files={files}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Preview Artist/gallery/photo-1.png' }));
  expect(fetch).toHaveBeenCalledOnce();
  const request = fetch.mock.calls[0]!;
  await user.click(screen.getByRole('button', { name: 'Next files' }));
  expect(request[1].signal.aborted).toBe(true);
  view.rerender(
    <CollectionBrowser
      jobId={job.id}
      files={files.slice(0, 1)}
    />,
  );
  expect(screen.getByText('Page 1 of 1')).toBeVisible();
  expect(screen.getAllByRole('link')).toHaveLength(1);
});

it('explains pinned choices and exposes only restart for ambiguous paused legacy collections', async () => {
  const user = userEvent.setup();
  const view = render(<CollectionScope job={job} />);
  await user.click(screen.getByText('Collection choices'));
  expect(screen.getByText('Artwork & videos, Journals & stories')).toBeVisible();
  expect(screen.getByText('Plain text · TXT')).toBeVisible();
  const legacy = { ...job, deviantart: undefined, status: DOWNLOAD_STATUS.paused, stage: DEVIANTART.legacyStage };
  view.rerender(
    <TransferControls
      job={legacy}
      isBusy={false}
      onAction={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Resume Artist collection' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Restart Artist collection from the beginning' })).toBeEnabled();
});
