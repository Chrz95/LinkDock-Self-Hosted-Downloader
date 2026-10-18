// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from '../src/features/theme/ThemeToggle';
import { applyTheme, readTheme, THEME } from '../src/features/theme/theme';
import { AddDownload } from '../src/features/downloads/components/AddDownload';
import { JobFiles } from '../src/features/downloads/components/files/JobFiles';
import { vi } from 'vitest';
import { DOWNLOAD_STATUS } from '../shared/contracts';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe('appearance and source controls', () => {
  it('defaults to dark, toggles the full document and restores a saved light preference', async () => {
    const user = userEvent.setup();
    expect(readTheme()).toBe(THEME.dark);
    applyTheme(THEME.dark);
    const view = render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem(THEME.storageKey)).toBe(THEME.light);
    view.unmount();
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });
  it('sends selected engine and quality while accepting magnet text', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<AddDownload onAdd={onAdd} />);
    await user.click(screen.getByRole('button', { name: 'Magnet' }));
    const url = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567';
    await user.type(screen.getByLabelText('File URL'), url);
    await user.click(screen.getByRole('button', { name: 'Add download' }));
    expect(onAdd).toHaveBeenCalledWith(url, 'magnet', '1080');
  });
  it('shows a separate authenticated link for every completed carousel or torrent file', () => {
    render(
      <JobFiles
        job={{
          id: 'job-id',
          url: 'https://instagram.com/p/example',
          filename: 'Post',
          status: DOWNLOAD_STATUS.completed,
          createdAt: '',
          finishedAt: '',
          receivedBytes: 1,
          totalBytes: 1,
          bytesPerSecond: 0,
          errorMessage: null,
          files: [
            { name: 'photo.jpg', relativePath: 'photo.jpg', sizeBytes: 1 },
            { name: 'video.mp4', relativePath: 'video.mp4', sizeBytes: 1 },
          ],
        }}
      />,
    );
    expect(screen.getByText('View 2 files')).toBeInTheDocument();
    expect(screen.getByLabelText('Save video.mp4 to this device')).toHaveAttribute(
      'href',
      '/api/downloads/job-id/files/1',
    );
  });
});
