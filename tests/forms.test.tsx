// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddDownload } from '../src/features/downloads/components/AddDownload';
import { UnlockStation } from '../src/features/session/UnlockStation';
import { DeleteDownload } from '../src/features/downloads/components/DeleteDownload';
import { DOWNLOAD_STATUS, type DownloadJob } from '../shared/contracts';

afterEach(cleanup);

/**
 * Groups behavior checks: station forms.
 */
describe('station forms', () => {
  /**
   * Verifies: submits a URL and clears it only after acceptance.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('submits a URL and clears it only after acceptance', async () => {
    const user = userEvent.setup();
    const addDownload = vi.fn().mockResolvedValue(undefined);
    render(<AddDownload onAdd={addDownload} />);
    await user.type(screen.getByLabelText('File URL'), 'https://example.com/file.zip');
    await user.click(screen.getByRole('button', { name: 'Add download' }));
    expect(addDownload).toHaveBeenCalledWith('https://example.com/file.zip', 'auto', '1080');
    expect(screen.getByLabelText('File URL')).toHaveValue('');
  });
  /**
   * Verifies: retains rejected input and exposes the error.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('retains rejected input and exposes the error', async () => {
    const user = userEvent.setup();
    const addDownload = vi.fn().mockRejectedValue(new Error('The history limit is reached.'));
    render(<AddDownload onAdd={addDownload} />);
    await user.type(screen.getByLabelText('File URL'), 'https://example.com/file.zip');
    await user.click(screen.getByRole('button', { name: 'Add download' }));
    expect(screen.getByRole('alert')).toHaveTextContent('history limit');
    expect(screen.getByLabelText('File URL')).toHaveValue('https://example.com/file.zip');
  });
  /**
   * Verifies: keeps authentication errors next to a labelled password control.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('keeps authentication errors next to a labelled password control', async () => {
    const user = userEvent.setup();
    const unlockStation = vi.fn().mockRejectedValue(new Error('Incorrect password.'));
    render(<UnlockStation onUnlock={unlockStation} />);
    await user.type(screen.getByLabelText('Station password'), 'incorrect');
    await user.click(screen.getByRole('button', { name: 'Unlock station' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password');
  });
  /**
   * Verifies: requires an explicit second click before deleting a completed file.
   * @returns {Promise<void>} Completion of the asynchronous behavior.
   */
  it('requires an explicit second click before deleting a completed file', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(undefined);
    const job: DownloadJob = {
      id: 'job-id',
      url: 'https://example.com/file',
      filename: 'file.zip',
      status: DOWNLOAD_STATUS.completed,
      receivedBytes: 1,
      totalBytes: 1,
      bytesPerSecond: 0,
      createdAt: '',
      finishedAt: '',
      errorMessage: null,
    };
    render(
      <DeleteDownload
        job={job}
        isBusy={false}
        onAction={onAction}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete file.zip' }));
    expect(onAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete file & record' }));
    expect(onAction).toHaveBeenCalledWith(job.id, 'delete');
  });
});
