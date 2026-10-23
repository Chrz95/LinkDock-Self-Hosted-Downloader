// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';
import { MEDIA_FAILURE } from '../shared/mediaFailures';
import { CookieFailurePrompt } from '../src/features/downloads/components/library/CookieFailurePrompt';
import { CookieHelpDialog } from '../src/features/downloads/components/library/CookieHelpDialog';
import { MediaRecovery } from '../src/features/downloads/components/library/MediaRecovery';

const JOB: DownloadJob = {
  id: 'session-failure',
  url: 'https://www.instagram.com/p/test',
  filename: 'Instagram collection',
  status: DOWNLOAD_STATUS.failed,
  mediaFailure: MEDIA_FAILURE.login,
  receivedBytes: 0,
  totalBytes: null,
  bytesPerSecond: 0,
  createdAt: '2026-10-23T12:00:00Z',
  finishedAt: '2026-10-23T12:01:00Z',
  errorMessage: 'This source needs a valid account session.',
};
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    }),
  });
});
afterEach(cleanup);

it('opens on account failure, shows installation and transfer steps, and stays dismissed across polling', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<CookieFailurePrompt jobs={[{ ...JOB, status: DOWNLOAD_STATUS.downloading }]} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  rerender(<CookieFailurePrompt jobs={[JOB]} />);
  const dialog = screen.getByRole('dialog', { name: 'Connect your account to continue' });
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByText('Load unpacked')).toBeVisible();
  expect(within(dialog).getByText('Send session to LinkDock')).toBeVisible();
  expect(within(dialog).getByText('Restart')).toBeVisible();
  expect(within(dialog).getByRole('link', { name: 'Download browser companion' })).toHaveAttribute(
    'href',
    '/linkdock-browser-connector.zip',
  );
  await user.click(within(dialog).getByRole('button', { name: 'Close' }));
  rerender(<CookieFailurePrompt jobs={[{ ...JOB }]} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  rerender(<CookieFailurePrompt jobs={[{ ...JOB, finishedAt: '2026-10-23T12:02:00Z' }]} />);
  expect(screen.getByRole('dialog')).toBeVisible();
});

it('does not label unrelated failures or completed jobs as missing cookies', () => {
  render(
    <CookieFailurePrompt
      jobs={[
        { ...JOB, mediaFailure: MEDIA_FAILURE.network },
        { ...JOB, id: 'format', mediaFailure: MEDIA_FAILURE.format },
        { ...JOB, id: 'verification', mediaFailure: MEDIA_FAILURE.verification },
        { ...JOB, id: 'done', status: DOWNLOAD_STATUS.completed },
      ]}
    />,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('queues simultaneous failures, supports Escape and closes when the pending job is removed', () => {
  const second = { ...JOB, id: 'second', filename: 'DeviantArt story', url: 'https://www.deviantart.com/artist/art/1' };
  const { rerender } = render(<CookieFailurePrompt jobs={[JOB, second]} />);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(screen.getByText('DeviantArt story')).toBeVisible();
  expect(screen.queryByText('Instagram collection')).not.toBeInTheDocument();
  rerender(<CookieFailurePrompt jobs={[JOB]} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('offers manual cookie import for sites the companion cannot connect, including lookalike domains', () => {
  render(
    <CookieHelpDialog
      job={{ ...JOB, url: 'https://instagram.com.evil.example/video' }}
      onClose={() => undefined}
    />,
  );
  expect(screen.getByText(/companion currently supports Instagram and DeviantArt only/)).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Download browser companion' })).not.toBeInTheDocument();
});

it('can reopen instructions from a failed library item and restores focus to the trigger', async () => {
  const user = userEvent.setup();
  render(<MediaRecovery job={JOB} />);
  const trigger = screen.getByRole('button', { name: 'Cookie connection instructions' });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('link', { name: 'Open original source' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  await user.click(within(dialog).getByRole('link', { name: 'Go to Download library' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(screen.getByRole('dialog')).toBeVisible();
});
