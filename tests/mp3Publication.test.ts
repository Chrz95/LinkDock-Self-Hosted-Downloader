import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { transferExternal } from '../server/engines/transferExternal';
import { downloadMedia } from '../server/engines/media';
import { TorrentRpc } from '../server/engines/torrent/rpc';
import { createQueuedJob } from '../server/downloads/batch';
import { resolveDownloadRequest } from '../server/engines/detectSource';
import { DownloadStore } from '../server/downloads/store';
import { AUDIO_QUALITY } from '../shared/sources';
import type { ServerConfig } from '../server/config';

vi.mock('../server/engines/media', () => ({ downloadMedia: vi.fn() }));
const directories: string[] = [];
const SIZE = 3;
const PORT = 8_080;
afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  vi.resetAllMocks();
});
/** Creates an isolated media job with no network engine. @returns {object} Worker inputs. */
function fixture() {
  const directory = mkdtempSync(path.resolve('tests/.mp3-'));
  directories.push(directory);
  const store = new DownloadStore(directory);
  const configuration: ServerConfig = {
    dataDirectory: directory,
    port: PORT,
    concurrency: 1,
    maximumFileBytes: SIZE,
    accessToken: 'test-secret-password-more-than-thirty-two-characters',
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
  const job = createQueuedJob(resolveDownloadRequest('https://youtu.be/test', 'video', AUDIO_QUALITY.balanced));
  return { store, configuration, job, engine: new TorrentRpc(directory) };
}
it('publishes only MP3 output and excludes source video/audio leftovers from browser delivery', async () => {
  const { store, configuration, job, engine } = fixture();
  vi.mocked(downloadMedia).mockImplementation(async (_job, root) => {
    await writeFile(path.join(root, 'track.mp3'), 'mp3');
    await writeFile(path.join(root, 'source.webm'), 'large private source material');
  });
  await transferExternal(job, store, new AbortController().signal, configuration, engine);
  expect(job.files).toEqual([{ name: 'track.mp3', relativePath: 'track.mp3', sizeBytes: SIZE }]);
  expect(readFileSync(`${store.getFilePath(job.id)}.files/track.mp3`, 'utf8')).toBe('mp3');
  expect(existsSync(`${store.getFilePath(job.id)}.files/source.webm`)).toBe(false);
});
it('fails rather than silently saving a video when the MP3 conversion produces no audio file', async () => {
  const { store, configuration, job, engine } = fixture();
  vi.mocked(downloadMedia).mockImplementation(async (_job, root) => {
    await writeFile(path.join(root, 'source.webm'), 'raw');
  });
  await expect(transferExternal(job, store, new AbortController().signal, configuration, engine)).rejects.toThrow(
    'no downloadable files',
  );
  expect(existsSync(`${store.getFilePath(job.id)}.files`)).toBe(false);
});
