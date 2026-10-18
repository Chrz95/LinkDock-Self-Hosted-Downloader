// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadList } from '../src/features/downloads/components/DownloadList';
import { OrganizationEditor } from '../src/features/downloads/components/library/OrganizationEditor';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { LIBRARY_FILTER } from '../shared/library';

const job: DownloadJob = {
  id: '2973533c-346f-49cf-9c9e-378378d820f8',
  url: 'https://example.com/clip.mp4',
  filename: 'clip.mp4',
  status: DOWNLOAD_STATUS.completed,
  receivedBytes: 1,
  totalBytes: 1,
  bytesPerSecond: 0,
  createdAt: '',
  finishedAt: '',
  errorMessage: null,
  library: { folder: 'Trips', tags: ['Travel'] },
};
afterEach(cleanup);

it('combines folder, tag and search filters and clears the complete restricted view', async () => {
  const user = userEvent.setup();
  const other = { ...job, id: 'other', filename: 'archive.zip', library: undefined };
  render(
    <DownloadList
      jobs={[job, other]}
      busyJobId={null}
      onAction={vi.fn()}
    />,
  );
  await user.selectOptions(screen.getByRole('combobox', { name: 'Folder' }), `${LIBRARY_FILTER.folderPrefix}Trips`);
  expect(screen.getByRole('article', { name: 'clip.mp4' })).toBeVisible();
  expect(screen.queryByRole('article', { name: 'archive.zip' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tag' }), 'travel');
  await user.type(screen.getByRole('searchbox', { name: 'Search downloads' }), 'unmatched');
  expect(screen.getByText('No matching downloads.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  const twoJobs = 2;
  expect(screen.getAllByRole('article')).toHaveLength(twoJobs);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Folder' }), LIBRARY_FILTER.unfiled);
  expect(screen.getByRole('article', { name: 'archive.zip' })).toBeVisible();
});

it('preserves dirty edits through server polling and retains rejected drafts until explicitly reset', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockRejectedValue(new Error('Disk full.'));
  const view = render(
    <OrganizationEditor
      job={job}
      onSave={onSave}
    />,
  );
  await user.click(screen.getByText('Organize download'));
  const folder = screen.getByRole('combobox', { name: 'Folder' });
  await user.clear(folder);
  await user.type(folder, 'My draft');
  const updated = { ...job, library: { folder: 'Remote edit', tags: ['New'] } };
  view.rerender(
    <OrganizationEditor
      job={updated}
      onSave={onSave}
    />,
  );
  expect(folder).toHaveValue('My draft');
  await user.click(screen.getByRole('button', { name: 'Save labels' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Disk full');
  expect(folder).toHaveValue('My draft');
  await user.click(screen.getByRole('button', { name: 'Reset labels' }));
  expect(folder).toHaveValue('Remote edit');
  expect(screen.getByRole('textbox', { name: 'Tags' })).toHaveValue('New');
});

it('submits normalized labels and renders saved organization as text', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <OrganizationEditor
      job={job}
      onSave={onSave}
    />,
  );
  await user.click(screen.getByText('Organize download'));
  const tags = screen.getByRole('textbox', { name: 'Tags' });
  await user.clear(tags);
  await user.type(tags, 'Useful, useful, <script>');
  await user.click(screen.getByRole('button', { name: 'Save labels' }));
  expect(onSave).toHaveBeenCalledWith(job.id, { folder: 'Trips', tags: ['Useful', '<script>'] });
  expect(screen.getByText('Labels saved.')).toBeVisible();
  cleanup();
  const saved = { ...job, library: { folder: '<b>Folder</b>'.replaceAll('/', ''), tags: ['<script>'] } };
  render(
    <DownloadList
      jobs={[saved]}
      busyJobId={null}
      onAction={vi.fn()}
    />,
  );
  const labels = screen.getByRole('list', { name: 'Labels for clip.mp4' });
  expect(within(labels).getByText('#<script>')).toBeVisible();
  expect(labels.querySelector('script')).toBeNull();
});
