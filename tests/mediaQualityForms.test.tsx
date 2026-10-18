// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { AddDownload } from '../src/features/downloads/components/AddDownload';
import { AUDIO_QUALITY, VIDEO_QUALITY } from '../shared/sources';

afterEach(cleanup);
it('switches from video heights to MP3 bitrates and submits the exact selected audio choice', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn().mockResolvedValue(undefined);
  render(<AddDownload onAdd={onAdd} />);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Output format' }), 'mp3');
  expect(screen.queryByRole('combobox', { name: 'Video quality' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Audio quality' }), AUDIO_QUALITY.high);
  await user.type(screen.getByRole('textbox', { name: 'File URL' }), 'https://youtu.be/test');
  await user.click(screen.getByRole('button', { name: 'Add download' }));
  expect(onAdd).toHaveBeenCalledWith('https://youtu.be/test', 'auto', AUDIO_QUALITY.high);
});
it('offers 4K/1440p and resets unsupported audio options when switching to a torrent engine', async () => {
  const user = userEvent.setup();
  render(<AddDownload onAdd={vi.fn()} />);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Video quality' }), VIDEO_QUALITY.ultra);
  expect(screen.getByRole('combobox', { name: 'Video quality' })).toHaveValue(VIDEO_QUALITY.ultra);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Output format' }), 'mp3');
  await user.click(screen.getByRole('button', { name: 'Torrent' }));
  expect(screen.getByRole('combobox', { name: 'Output format' })).toHaveValue('video');
  expect(screen.getByRole('combobox', { name: 'Video quality' })).toBeDisabled();
});
