import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { DownloadQueue } from '../../server/downloads/queue';
import { createApplication } from '../../server/app';
import { API_PATH, DOWNLOAD_STATUS } from '../../shared/contracts';
import type { ServerConfig } from '../../server/config';

/** Actual tiny PNG bytes exercise prefix checks and unmodified HTTP delivery. */
export const IMAGE_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1X8AAAAASUVORK5CYII=',
  'base64',
);
/** A container header fixture tests byte seeking without claiming to be a decodable video. */
export const VIDEO_BYTES = Buffer.concat([
  Buffer.from('000000186674797069736f6d0000000069736f6d6d703432', 'hex'),
  Buffer.from('native-video-fixture'),
]);
const PORT = 8_080;
const MAXIMUM_BYTES = 33_554_432;
const resources: { queue: DownloadQueue; directory: string }[] = [];

/**
 * Creates a stopped real station so source downloads cannot run during saved-file delivery tests.
 * @returns {Promise<object>} Owner client, queue and published-file factories.
 */
export async function createDeliveryFixture() {
  const directory = mkdtempSync(path.resolve('tests/.delivery-'));
  const configuration: ServerConfig = {
    dataDirectory: directory,
    port: PORT,
    accessToken: 'delivery-test-password-at-least-32-characters',
    concurrency: 1,
    maximumFileBytes: MAXIMUM_BYTES,
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
  const queue = new DownloadQueue(configuration);
  await queue.stop();
  resources.push({ queue, directory });
  const application = createApplication(configuration, queue);
  const client = request.agent(application);
  let sequence = 0;
  /**
   * Publishes one legacy direct file with exact bytes.
   * @param {string} filename - Display name.
   * @param {Buffer} bytes - Actual file content.
   * @returns {DownloadJob} Completed record.
   */
  function createFile(filename: string, bytes: Buffer) {
    sequence += 1;
    const job = queue.add(`https://example.com/file-${sequence}`);
    job.filename = filename;
    job.status = DOWNLOAD_STATUS.completed;
    job.receivedBytes = bytes.length;
    job.totalBytes = bytes.length;
    writeFileSync(queue.store.getFilePath(job.id), bytes);
    queue.store.save();
    return job;
  }
  /**
   * Publishes an isolated multi-file manifest without copying application state into it.
   * @param {Record<string, Buffer | string>} files - Safe fixture-relative names and bytes.
   * @returns {DownloadJob} Completed multi-file record.
   */
  function createCollection(files: Record<string, Buffer | string>) {
    sequence += 1;
    const job = queue.add(`https://example.com/collection-${sequence}`);
    const root = `${queue.store.getFilePath(job.id)}.files`;
    job.filename = 'Saved collection';
    job.status = DOWNLOAD_STATUS.completed;
    job.files = Object.entries(files).map(([name, bytes]) => {
      const filename = path.join(root, name);
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, bytes);
      return { name, relativePath: name, sizeBytes: Buffer.byteLength(bytes) };
    });
    job.receivedBytes = job.files.reduce((sum, file) => sum + file.sizeBytes, 0);
    job.totalBytes = job.receivedBytes;
    queue.store.save();
    return job;
  }
  /** Establishes the browser cookie without real credentials. @returns {Promise<void>} Owner client ready. */
  async function login(): Promise<void> {
    await client.post(API_PATH.session).send({ token: configuration.accessToken });
  }
  return { queue, directory, application, configuration, client, createFile, createCollection, login };
}

/** Cleans queues and all private fixture bytes. @returns {Promise<void>} No fixture state retained. */
export async function cleanupDeliveryFixtures(): Promise<void> {
  for (const { queue, directory } of resources.splice(0)) {
    await queue.stop();
    rmSync(directory, { recursive: true, force: true });
  }
}
