import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MEDIA_FAILURE, MEDIA_FAILURE_INFO } from '../shared/mediaFailures';
import { EngineProcessError } from '../server/engines/failures';
import { DownloadQueue } from '../server/downloads/queue';
import { downloadMedia } from '../server/engines/media';
import { createApplication } from '../server/app';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import { SOURCE_TYPE } from '../shared/sources';
import type { ServerConfig } from '../server/config';

vi.mock('../server/engines/media', () => ({ downloadMedia: vi.fn() }));
const MAXIMUM_BYTES = 1_024;
const SERVICE_PORT = 8_080;
const resources: { directory: string; queue: DownloadQueue }[] = [];
/**
 * Creates a complete queue with isolated storage and deterministic site extraction.
 * @returns {object} Queue and configuration for authenticated HTTP checks.
 */
function createStation() {
  const directory = mkdtempSync(path.resolve('tests/.external-'));
  const configuration: ServerConfig = {
    dataDirectory: directory,
    accessToken: 'test-password-for-the-complete-station',
    port: SERVICE_PORT,
    concurrency: 1,
    maximumFileBytes: MAXIMUM_BYTES,
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
  const queue = new DownloadQueue(configuration);
  resources.push({ directory, queue });
  return { queue, configuration };
}
afterEach(() => {
  for (const resource of resources.splice(0)) {
    resource.queue.stop();
    rmSync(resource.directory, { recursive: true, force: true });
  }
  vi.mocked(downloadMedia).mockReset();
});

describe('multi-file job publication and delivery', () => {
  it('publishes a mixed DeviantArt gallery and moves it to the global completed folder', async () => {
    vi.mocked(downloadMedia).mockImplementation(async (_job, directory) => {
      await writeFile(path.join(directory, 'story.txt'), 'A complete story.');
      await writeFile(path.join(directory, 'photo.jpg'), 'image');
      await writeFile(path.join(directory, 'clip.mp4'), 'video');
    });
    const { queue, configuration } = createStation();
    queue.updateSettings({ ...queue.policy.settings, completionDirectory: '.' });
    const job = queue.add('https://www.deviantart.com/artist/gallery');
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
    expect(job.sourceType).toBe(SOURCE_TYPE.deviantart);
    expect(job.destination?.moved).toBe(true);
    expect(job.files?.map((file) => file.name)).toEqual(['clip.mp4', 'photo.jpg', 'story.txt']);
    const client = request.agent(createApplication(configuration, queue));
    await client.post(API_PATH.session).send({ token: configuration.accessToken });
    const storyIndex = job.files!.findIndex((file) => file.name === 'story.txt');
    const saved = await client.get(`${API_PATH.downloads}/${job.id}/files/${storyIndex}`).expect(HTTP_STATUS.ok);
    expect(saved.headers['content-disposition']).toContain('attachment');
    expect(readFileSync(path.join(queue.store.getOutputDirectory(job), 'story.txt'), 'utf8')).toBe('A complete story.');
  });
  it('keeps private media staging while paused and passes it back to the resumed engine', async () => {
    vi.mocked(downloadMedia)
      .mockImplementationOnce(async (_job, directory, signal) => {
        await writeFile(path.join(directory, 'video.mp4.part'), 'partial');
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      })
      .mockImplementationOnce(async (_job, directory) => {
        expect(readFileSync(path.join(directory, 'video.mp4.part'), 'utf8')).toBe('partial');
        rmSync(path.join(directory, 'video.mp4.part'));
        await writeFile(path.join(directory, 'video.mp4'), 'complete');
      });
    const { queue } = createStation();
    const job = queue.add('https://youtu.be/example', SOURCE_TYPE.video);
    const partial = `${queue.store.getFilePath(job.id)}.work/video.mp4.part`;
    await vi.waitFor(() => expect(existsSync(partial)).toBe(true));
    await queue.pause(job);
    expect(existsSync(partial)).toBe(true);
    expect(existsSync(`${queue.store.getFilePath(job.id)}.files`)).toBe(false);
    queue.resume(job);
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
    expect(readFileSync(`${queue.store.getFilePath(job.id)}.files/video.mp4`, 'utf8')).toBe('complete');
  });
  it('publishes a carousel atomically and serves every manifest file through authenticated routes', async () => {
    vi.mocked(downloadMedia).mockImplementation(async (_job, directory) => {
      await writeFile(path.join(directory, 'photo.jpg'), 'image bytes');
      await writeFile(path.join(directory, 'video.mp4'), 'video bytes');
    });
    const { queue, configuration } = createStation();
    const job = queue.add('https://www.instagram.com/p/example/', SOURCE_TYPE.instagram);
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.completed));
    const expectedFiles = 2;
    expect(job.files).toHaveLength(expectedFiles);
    expect(existsSync(`${queue.store.getFilePath(job.id)}.work`)).toBe(false);
    expect(readFileSync(`${queue.store.getFilePath(job.id)}.files/video.mp4`, 'utf8')).toBe('video bytes');
    const client = request.agent(createApplication(configuration, queue));
    await client.post(API_PATH.session).send({ token: configuration.accessToken }).expect(HTTP_STATUS.noContent);
    const response = await client.get(`${API_PATH.downloads}/${job.id}/files/1`).expect(HTTP_STATUS.ok);
    expect(response.body.toString()).toBe('video bytes');
    await client.get(`${API_PATH.downloads}/${job.id}/files/-1`).expect(HTTP_STATUS.notFound);
    await client.get(`${API_PATH.downloads}/${job.id}/files/999`).expect(HTTP_STATUS.notFound);
    queue.remove(job);
    expect(existsSync(`${queue.store.getFilePath(job.id)}.files`)).toBe(false);
  });
  it('does not publish incomplete output after an extractor fails', async () => {
    vi.mocked(downloadMedia).mockImplementation(async (_job, directory) => {
      await writeFile(path.join(directory, 'incomplete.jpg'), 'partial');
      throw new Error('The source requires login.');
    });
    const { queue } = createStation();
    const job = queue.add('https://instagram.com/p/example/', SOURCE_TYPE.instagram);
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.failed));
    expect(job.files).toBeUndefined();
    expect(existsSync(`${queue.store.getFilePath(job.id)}.work`)).toBe(false);
    expect(existsSync(`${queue.store.getFilePath(job.id)}.files`)).toBe(false);
  });
  it('persists a safe engine failure category and exposes it through the private dashboard', async () => {
    vi.mocked(downloadMedia).mockRejectedValue(new EngineProcessError(MEDIA_FAILURE.format));
    const { queue, configuration } = createStation();
    const job = queue.add('https://youtu.be/offline-recovery', SOURCE_TYPE.video);
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.failed));
    expect(job.mediaFailure).toBe(MEDIA_FAILURE.format);
    expect(job.errorMessage).toBe(MEDIA_FAILURE_INFO.format.message);
    const client = request.agent(createApplication(configuration, queue));
    await client.post(API_PATH.session).send({ token: configuration.accessToken });
    const snapshot = await client.get(API_PATH.downloads).expect(HTTP_STATUS.ok);
    expect(snapshot.body.jobs[0].mediaFailure).toBe(MEDIA_FAILURE.format);
  });
  it('rejects final file sets above the configured total quota', async () => {
    vi.mocked(downloadMedia).mockImplementation(async (_job, directory) => {
      await writeFile(path.join(directory, 'large.mp4'), Buffer.alloc(MAXIMUM_BYTES + 1));
    });
    const { queue } = createStation();
    const job = queue.add('https://youtu.be/example', SOURCE_TYPE.video);
    await vi.waitFor(() => expect(job.status).toBe(DOWNLOAD_STATUS.failed));
    expect(job.errorMessage).toContain('total size limit');
    expect(existsSync(`${queue.store.getFilePath(job.id)}.files`)).toBe(false);
  });
});
