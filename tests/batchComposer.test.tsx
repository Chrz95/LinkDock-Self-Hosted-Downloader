// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AddDownload } from '../src/features/downloads/components/AddDownload';
import { PriorityControl } from '../src/features/downloads/components/PriorityControl';
import { previewBatch } from '../src/features/downloads/services/downloadApi';
import {
  captureSharedLinks,
  clearSharedDraft,
  extractSharedLinks,
  readSharedDraft,
} from '../src/features/mobile/sharedLinks';
import { createQueuedJob } from '../server/downloads/batch';
import { resolveDownloadRequest } from '../server/engines/detectSource';
import { JOB_ACTION } from '../shared/contracts';
import { JOB_PRIORITY, MAXIMUM_BATCH_LINKS } from '../shared/batch';

vi.mock('../src/features/downloads/services/downloadApi', () => ({ previewBatch: vi.fn() }));
afterEach(() => {
  cleanup();
  clearSharedDraft();
  window.history.replaceState(null, '', '/');
  vi.mocked(previewBatch).mockReset();
});

it('reviews multiline links before an explicit batch commit and invalidates edited reviews', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  const onBatch = vi.fn().mockResolvedValue({ added: [{}], newCount: 1, duplicates: ['https://example.com/a'] });
  vi.mocked(previewBatch).mockResolvedValue({ newCount: 1, duplicates: ['https://example.com/a'] });
  render(
    <AddDownload
      onAdd={onAdd}
      onBatch={onBatch}
    />,
  );
  await user.type(screen.getByLabelText('File URL'), 'https://example.com/a{Enter}https://example.com/b');
  await user.click(screen.getByRole('button', { name: /Review/ }));
  expect(onBatch).not.toHaveBeenCalled();
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByText(/duplicates skipped/)).toBeVisible();
  await user.type(screen.getByLabelText('File URL'), '{Enter}https://example.com/c');
  expect(screen.getByRole('button', { name: /Review/ })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: /Review/ }));
  await user.click(screen.getByRole('button', { name: /Queue/ }));
  expect(onBatch).toHaveBeenCalledWith(
    ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
    'auto',
    '1080',
  );
  expect(screen.getByLabelText('File URL')).toHaveValue('');
});

it('retains an exact shared URL through the password gate without automatically submitting it', () => {
  const source = 'https://example.com/file?signature=a+b%2Fc&token=x=';
  const query = new URLSearchParams({ share_url: source, share_title: 'Private title', other: 'kept' });
  window.history.replaceState(null, '', `/?${query}`);
  captureSharedLinks(window);
  expect(readSharedDraft()).toBe(source);
  expect(window.location.search).toBe('?other=kept');
  expect(window.location.hash).toBe('#add-download');
  const onAdd = vi.fn();
  render(<AddDownload onAdd={onAdd} />);
  expect(screen.getByLabelText('File URL')).toHaveValue(source);
  expect(onAdd).not.toHaveBeenCalled();
  expect(extractSharedLinks('file:///secret javascript:bad')).toEqual([]);
  const text = Array.from({ length: MAXIMUM_BATCH_LINKS + 1 }, (_value, index) => `https://example.com/${index}`).join(
    ' ',
  );
  expect(extractSharedLinks(text)).toHaveLength(MAXIMUM_BATCH_LINKS);
});

it('provides labelled keyboard and touch priority controls for waiting jobs', async () => {
  const user = userEvent.setup();
  const job = createQueuedJob(resolveDownloadRequest('https://example.com/archive.zip', undefined, undefined));
  const onAction = vi.fn().mockResolvedValue(undefined);
  render(
    <PriorityControl
      job={job}
      isBusy={false}
      onAction={onAction}
    />,
  );
  await user.selectOptions(screen.getByLabelText('Queue priority for archive.zip'), String(JOB_PRIORITY.high));
  expect(onAction).toHaveBeenCalledWith(job.id, JOB_ACTION.priorityHigh);
});
