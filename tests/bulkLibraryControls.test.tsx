// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadList } from '../src/features/downloads/components/DownloadList';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { BULK_ACTION, BULK_LIBRARY, TAG_MODE, type BulkLibraryResult, type MutateLibrary } from '../shared/bulkLibrary';
import { LIBRARY_LIMIT } from '../shared/library';

const TWO = 2;
const SUFFIX_LENGTH = 12;
const EMPTY_RESULT: BulkLibraryResult = { updatedIds: [], deletedIds: [], failures: [] };
/**
 * Creates distinct canonical IDs without source network access or timestamps irrelevant to these controls.
 * @param {number} sequence - Unique suffix.
 * @returns {DownloadJob} Completed display fixture.
 */
function createJob(sequence: number): DownloadJob {
  return {
    id: `2973533c-346f-49cf-9c9e-${String(sequence).padStart(SUFFIX_LENGTH, '0')}`,
    url: `https://example.com/${sequence}`,
    filename: `file-${sequence}.txt`,
    status: DOWNLOAD_STATUS.completed,
    receivedBytes: 1,
    totalBytes: 1,
    bytesPerSecond: 0,
    createdAt: '',
    finishedAt: '',
    errorMessage: null,
  };
}
const FIRST = createJob(1);
const SECOND = createJob(TWO);
/**
 * Composes the real list so selection and filters are exercised together.
 * @param {DownloadJob[]} jobs - Retained rows.
 * @param {MutateLibrary} onBulk - Test-owned mutation boundary.
 * @returns {JSX.Element} Live collection controls.
 */
function collection(jobs: DownloadJob[], onBulk: MutateLibrary) {
  return (
    <DownloadList
      jobs={jobs}
      busyJobId={null}
      onAction={vi.fn()}
      onBulk={onBulk}
    />
  );
}
afterEach(cleanup);

it('selects only visible IDs, keeps selection stable through polling and clears it when filters change', async () => {
  const user = userEvent.setup();
  const onBulk = vi.fn().mockResolvedValue(EMPTY_RESULT);
  const view = render(collection([FIRST], onBulk));
  await user.click(screen.getByRole('button', { name: /Select visible/ }));
  view.rerender(collection([FIRST, SECOND], onBulk));
  expect(screen.getByRole('checkbox', { name: 'Select file-1.txt' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Select file-2.txt' })).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Review deletion' }));
  expect(screen.getByRole('heading', { name: /Delete 1 downloads/ })).toHaveFocus();
  await user.type(screen.getByRole('searchbox', { name: 'Search downloads' }), 'file-2');
  expect(screen.getByText('0 selected')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Permanently delete/ })).not.toBeInTheDocument();
  await user.clear(screen.getByRole('searchbox'));
  expect(screen.getByRole('checkbox', { name: 'Select file-1.txt' })).not.toBeChecked();
  expect(onBulk).not.toHaveBeenCalled();
});

it('bounds select-visible and manual selection and releases a slot when a checkbox is cleared', async () => {
  const user = userEvent.setup();
  const jobs = Array.from({ length: BULK_LIBRARY.maximum + 1 }, (_, index) => createJob(index + 1));
  render(collection(jobs, vi.fn()));
  await user.click(screen.getByRole('button', { name: /Select visible/ }));
  expect(screen.getByText(`${BULK_LIBRARY.maximum} selected`)).toBeVisible();
  const last = screen.getByRole('checkbox', { name: `Select file-${BULK_LIBRARY.maximum + 1}.txt` });
  expect(last).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: 'Select file-1.txt' }));
  expect(last).toBeEnabled();
  await user.click(last);
  expect(last).toBeChecked();
});

it('reviews exact filenames, allows cancellation and submits confirmed deletion once', async () => {
  const user = userEvent.setup();
  let resolve: ((result: BulkLibraryResult) => void) | undefined;
  const onBulk = vi.fn().mockImplementation(
    () =>
      new Promise<BulkLibraryResult>((done) => {
        resolve = done;
      }),
  );
  render(collection([FIRST, SECOND], onBulk));
  await user.click(screen.getByRole('button', { name: /Select visible/ }));
  await user.click(screen.getByRole('button', { name: 'Review deletion' }));
  const review = screen.getByRole('list', { name: 'Downloads to delete' });
  expect(within(review).getAllByRole('listitem')).toHaveLength(TWO);
  expect(review).toHaveTextContent(FIRST.filename);
  expect(review).toHaveTextContent(SECOND.filename);
  expect(onBulk).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep downloads' }));
  expect(onBulk).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Review deletion' }));
  const confirm = screen.getByRole('button', { name: 'Permanently delete 2 downloads' });
  await user.dblClick(confirm);
  expect(onBulk).toHaveBeenCalledTimes(1);
  expect(onBulk).toHaveBeenCalledWith({
    action: BULK_ACTION.delete,
    ids: [FIRST.id, SECOND.id],
    confirmation: BULK_LIBRARY.confirmation,
  });
  expect(screen.getByRole('searchbox')).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Select file-1.txt' })).toBeDisabled();
  await act(async () => {
    resolve?.({ ...EMPTY_RESULT, deletedIds: [FIRST.id, SECOND.id] });
  });
  expect(screen.getByText('2 downloads deleted.')).toBeVisible();
  expect(screen.getByText('0 selected')).toBeVisible();
});

it('invalidates review on selection changes and allows unfinished jobs to be organized', async () => {
  const user = userEvent.setup();
  render(collection([FIRST, { ...SECOND, status: DOWNLOAD_STATUS.paused }], vi.fn()));
  await user.click(screen.getByRole('checkbox', { name: 'Select file-1.txt' }));
  await user.click(screen.getByRole('button', { name: 'Review deletion' }));
  await user.click(screen.getByRole('checkbox', { name: 'Select file-2.txt' }));
  expect(screen.queryByRole('button', { name: /Permanently delete/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review deletion' })).toBeDisabled();
  expect(screen.getByText('Organize selected')).toBeVisible();
});

it('preserves omitted fields, combines folder/tag edits and makes empty replacement explicit', async () => {
  const user = userEvent.setup();
  const onBulk = vi.fn().mockResolvedValue({ ...EMPTY_RESULT, updatedIds: [FIRST.id, SECOND.id] });
  render(collection([FIRST, SECOND], onBulk));
  await user.click(screen.getByRole('button', { name: /Select visible/ }));
  await user.click(screen.getByText('Organize selected'));
  const save = screen.getByRole('button', { name: /Apply labels/ });
  expect(save).toBeDisabled();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tag changes' }), TAG_MODE.add);
  await user.type(screen.getByRole('textbox', { name: 'Tags, separated by commas' }), ' Travel, travel ');
  await user.click(save);
  expect(onBulk).toHaveBeenLastCalledWith({
    action: BULK_ACTION.organize,
    ids: [FIRST.id, SECOND.id],
    tagMode: TAG_MODE.add,
    tags: ['Travel'],
  });
  await user.click(screen.getByRole('checkbox', { name: 'Change folder for all selected' }));
  await user.type(screen.getByRole('combobox', { name: /New folder/ }), 'Trips');
  await user.click(save);
  expect(onBulk).toHaveBeenLastCalledWith({
    action: BULK_ACTION.organize,
    ids: [FIRST.id, SECOND.id],
    folder: 'Trips',
    tagMode: TAG_MODE.add,
    tags: ['Travel'],
  });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tag changes' }), TAG_MODE.replace);
  await user.clear(screen.getByRole('textbox', { name: 'Tags, separated by commas' }));
  expect(screen.getByText(/empty field clears/)).toBeVisible();
  await user.click(save);
  expect(onBulk).toHaveBeenLastCalledWith({
    action: BULK_ACTION.organize,
    ids: [FIRST.id, SECOND.id],
    folder: 'Trips',
    tagMode: TAG_MODE.replace,
    tags: [],
  });
});

it('validates every resulting tag set before requesting an edit and keeps rejected field drafts', async () => {
  const user = userEvent.setup();
  const onBulk = vi.fn();
  const full = {
    ...SECOND,
    library: { folder: '', tags: Array.from({ length: LIBRARY_LIMIT.tags }, (_, i) => `T${i}`) },
  };
  render(collection([FIRST, full], onBulk));
  await user.click(screen.getByRole('button', { name: /Select visible/ }));
  await user.click(screen.getByText('Organize selected'));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tag changes' }), TAG_MODE.add);
  const tags = screen.getByRole('textbox', { name: 'Tags, separated by commas' });
  await user.type(tags, 'Overflow');
  await user.click(screen.getByRole('button', { name: /Apply labels/ }));
  expect(screen.getByRole('alert')).toHaveTextContent(`up to ${LIBRARY_LIMIT.tags} tags`);
  expect(tags).toHaveValue('Overflow');
  expect(onBulk).not.toHaveBeenCalled();
});

it('shows partial deletion outcomes and retains only failed IDs for a separately reviewed retry', async () => {
  const user = userEvent.setup();
  const onBulk = vi.fn().mockResolvedValue({
    ...EMPTY_RESULT,
    deletedIds: [FIRST.id],
    failures: [{ id: SECOND.id, message: 'Some files may already be removed.' }],
  });
  render(collection([FIRST, SECOND], onBulk));
  await user.click(screen.getByRole('button', { name: /Select visible/ }));
  await user.click(screen.getByRole('button', { name: 'Review deletion' }));
  await user.click(screen.getByRole('button', { name: /Permanently delete/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('1 deletions failed');
  expect(screen.getByRole('checkbox', { name: 'Select file-1.txt' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Select file-2.txt' })).toBeChecked();
  expect(screen.queryByRole('button', { name: /Permanently delete/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Review deletion' }));
  expect(screen.getByRole('list', { name: 'Downloads to delete' })).not.toHaveTextContent(FIRST.filename);
  expect(onBulk).toHaveBeenCalledTimes(1);
});

it('keeps selection and feedback after a rejected request without retrying automatically', async () => {
  const user = userEvent.setup();
  const onBulk = vi.fn().mockRejectedValue(new Error('The selection changed. Refresh and select again.'));
  render(collection([FIRST], onBulk));
  await user.click(screen.getByRole('checkbox', { name: 'Select file-1.txt' }));
  await user.click(screen.getByRole('button', { name: 'Review deletion' }));
  await user.click(screen.getByRole('button', { name: /Permanently delete/ }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('selection changed'));
  expect(screen.getByRole('checkbox', { name: 'Select file-1.txt' })).toBeChecked();
  expect(onBulk).toHaveBeenCalledTimes(1);
});

it('drops IDs and invalidates deletion review when polling moves selected rows outside the filtered view', async () => {
  const user = userEvent.setup();
  const onBulk = vi.fn();
  const view = render(collection([FIRST, SECOND], onBulk));
  await user.click(screen.getByRole('button', { name: 'Completed' }));
  await user.click(screen.getByRole('button', { name: /Select visible/ }));
  await user.click(screen.getByRole('button', { name: 'Review deletion' }));
  view.rerender(collection([FIRST, { ...SECOND, status: DOWNLOAD_STATUS.paused }], onBulk));
  expect(screen.getByText('1 selected')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Permanently delete/ })).not.toBeInTheDocument();
  view.rerender(collection([FIRST, SECOND], onBulk));
  expect(screen.getByRole('checkbox', { name: 'Select file-2.txt' })).not.toBeChecked();
  expect(onBulk).not.toHaveBeenCalled();
});
