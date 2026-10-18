import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, Server } from 'node:http';
import { Readable } from 'node:stream';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadQueue } from '../server/downloads/queue';
import { createApplication } from '../server/app';
import { openSource } from '../server/downloads/openSource';
import { runStationCommand } from '../server/control/client';
import { parseCliArguments, parseIndexes } from '../server/control/cliArgs';
import { validateControlState } from '../server/control/service';
import { validateControlTime, CONTROL } from '../shared/control';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import type { ServerConfig } from '../server/config';

vi.mock('../server/downloads/openSource', () => ({ openSource: vi.fn() }));
const FIXED_NOW = '2026-10-18T12:00:00Z';
const PORT = 8_080;
const BYTE_LIMIT = 1_024;
const SECOND_INDEX = 2;
const INVALID_INDEX = 9_999;
const resources: { queue: DownloadQueue; directory?: string }[] = [];
const servers: Server[] = [];
/** Creates an authenticated queue fixture, initially holding all workers. @returns {Promise<object>} Station. */
async function station() {
  const directory = mkdtempSync(path.resolve('tests/.control-'));
  const configuration: ServerConfig = {
    dataDirectory: directory,
    port: PORT,
    concurrency: 1,
    maximumFileBytes: BYTE_LIMIT,
    accessToken: 'control-test-password-more-than-thirty-two-characters',
    secureCookie: false,
    publicOrigin: undefined,
    isProduction: false,
  };
  const queue = new DownloadQueue(configuration);
  resources.push({ queue, directory });
  await queue.controls.command('pause', 'all');
  return { queue, configuration, directory };
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const { queue } of resources) {
    await queue.stop();
  }
  for (const { directory } of resources.splice(0)) {
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(openSource).mockReset();
});

it('persists a global pause across restarts, holds new jobs and resumes eligible work', async () => {
  const { queue, configuration } = await station();
  const first = queue.add('https://example.com/first');
  const awaitingSelection = queue.addTorrent(Buffer.from('d4:infod4:name4:testee').toString('base64'), 'test.torrent');
  awaitingSelection.status = DOWNLOAD_STATUS.paused;
  awaitingSelection.torrentSelection = { files: [{ index: 1, name: 'review.bin', sizeBytes: 1 }] };
  queue.store.save();
  await queue.stop();
  const recovered = new DownloadQueue(configuration);
  resources.push({ queue: recovered });
  expect(recovered.controls.snapshot().paused).toBe(true);
  const second = recovered.add('https://example.com/second');
  expect(openSource).not.toHaveBeenCalled();
  vi.mocked(openSource).mockImplementation(async () => {
    return Object.assign(Readable.from(['yes']), { headers: {} }) as unknown as IncomingMessage;
  });
  await recovered.controls.command('resume', 'all');
  await vi.waitFor(() =>
    expect(recovered.store.jobs.find((job) => job.id === first.id)?.status).toBe(DOWNLOAD_STATUS.completed),
  );
  await vi.waitFor(() => expect(second.status).toBe(DOWNLOAD_STATUS.completed));
  expect(recovered.store.jobs.find((job) => job.id === awaitingSelection.id)?.status).toBe(DOWNLOAD_STATUS.paused);
});

it(
  'executes persisted one-shot schedules in timestamp order, reports outcomes ' + 'and cancels pending actions',
  async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(FIXED_NOW));
    const { queue } = await station();
    const job = queue.add('https://example.com/file');
    const pause = await queue.controls.command('pause', job.id, '2026-10-18T12:00:01Z');
    const later = await queue.controls.command('resume', job.id, '2026-10-18T12:05:00Z');
    queue.controls.cancel(later.task!.id);
    vi.setSystemTime(new Date('2026-10-18T12:00:02Z'));
    await queue.controls.tick();
    expect(job.status).toBe(DOWNLOAD_STATUS.paused);
    expect(queue.controls.snapshot().tasks.find((task) => task.id === pause.task?.id)?.status).toBe('done');
    expect(queue.controls.snapshot().tasks).toHaveLength(1);
    expect(() => queue.controls.cancel(pause.task!.id)).toThrow('executing');
  },
);

it('replays an overdue running pause before starting recovered queued jobs', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(FIXED_NOW));
  const { queue, configuration, directory } = await station();
  const job = queue.add('https://example.com/recovered');
  const result = await queue.controls.command('pause', 'all', '2026-10-18T12:00:01Z');
  await queue.stop();
  const saved = queue.controls.snapshot();
  saved.paused = false;
  saved.tasks[0]!.status = 'running';
  writeFileSync(path.join(directory, 'controls.json'), JSON.stringify(saved));
  vi.setSystemTime(new Date('2026-10-18T12:00:02Z'));
  const recovered = new DownloadQueue(configuration);
  resources.push({ queue: recovered });
  expect(recovered.controls.ready).toBe(false);
  expect(openSource).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(recovered.controls.snapshot().tasks[0]?.status).toBe('done'));
  expect(recovered.controls.snapshot().paused).toBe(true);
  expect(recovered.store.jobs.find((item) => item.id === job.id)?.status).toBe(DOWNLOAD_STATUS.paused);
  expect(readFileSync(path.join(directory, 'controls.json'), 'utf8')).toContain(result.task!.id);
});

it('protects terminal controls and job options behind sessions and origin checks', async () => {
  const { queue, configuration } = await station();
  const job = queue.addTorrent(Buffer.from('d4:infod4:name4:testee').toString('base64'), 'test.torrent');
  job.status = DOWNLOAD_STATUS.paused;
  job.torrentSelection = { files: [{ index: 1, name: 'file.bin', sizeBytes: 1 }] };
  queue.store.save();
  const client = request.agent(createApplication(configuration, queue));
  await client.get(CONTROL.path).expect(HTTP_STATUS.unauthorized);
  const endpoint = `${API_PATH.downloads}/${job.id}/torrent-selection`;
  await client
    .post(endpoint)
    .send({ indexes: [1] })
    .expect(HTTP_STATUS.unauthorized);
  await client.post(API_PATH.session).send({ token: configuration.accessToken }).expect(HTTP_STATUS.noContent);
  await client
    .post(CONTROL.path)
    .set('Origin', 'https://attacker.example')
    .send({ action: 'resume', target: 'all' })
    .expect(HTTP_STATUS.forbidden);
  await client.post(endpoint).send({ indexes: [] }).expect(HTTP_STATUS.conflict);
  await client
    .post(endpoint)
    .send({ indexes: [1] })
    .expect(HTTP_STATUS.noContent);
  await client
    .post(`${API_PATH.downloads}/${job.id}/destination`)
    .send({ directory: '/escape' })
    .expect(HTTP_STATUS.conflict);
  await client
    .post(`${API_PATH.downloads}/${job.id}/destination`)
    .send({ directory: 'Media/Travel' })
    .expect(HTTP_STATUS.noContent);
  expect(job.destination?.directory).toBe('Media/Travel');
  expect((await client.get(CONTROL.path)).headers['cache-control']).toBe('no-store');
});

it(
  'uses real loopback authentication for CLI commands, including secure proxy ' +
    'configuration, without printing secrets',
  async () => {
    const { queue, configuration } = await station();
    const job = queue.add('https://example.com/private?token=signed-source-secret');
    configuration.publicOrigin = 'https://station.example';
    configuration.secureCookie = true;
    const application = createApplication(configuration, queue);
    const server = application.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('No test port');
    }
    configuration.port = address.port;
    const output = await runStationCommand(configuration, ['list']);
    expect(output).toContain(job.id);
    expect(output).not.toContain('signed-source-secret');
    expect(output).not.toContain(configuration.accessToken);
    await runStationCommand(configuration, ['pause', job.id]);
    expect(job.status).toBe(DOWNLOAD_STATUS.paused);
    await runStationCommand(configuration, ['destination', job.id, 'Movies']);
    expect(job.destination?.directory).toBe('Movies');
    expect(await runStationCommand(configuration, ['schedules'])).toContain('paused');
    expect(await runStationCommand(configuration, ['--help'])).toContain('docker compose exec');
  },
);

it('rejects ambiguous/invalid calendar times, malformed state and unsupported terminal text', () => {
  const now = Date.parse(FIXED_NOW);
  for (const timestamp of [
    '2026-10-18T13:00:00',
    '2026-11-31T13:00:00Z',
    '2026-10-20T24:00:00Z',
    '2026-10-18T10:00:00Z',
    '2028-10-18T13:00:00Z',
  ]) {
    expect(() => validateControlTime(timestamp, now)).toThrow();
  }
  expect(validateControlTime('2026-10-18T16:00:00+03:00', now)).toBe('2026-10-18T13:00:00.000Z');
  expect(() => validateControlState({ paused: false, tasks: [{ action: 'rm -rf /' }] })).toThrow();
  expect(() => parseCliArguments(['pause', 'all', '--eval', 'anything'])).toThrow();
  expect(() => parseCliArguments(['shell', 'all'])).toThrow();
  expect(parseIndexes('1,2')).toEqual([1, SECOND_INDEX]);
  expect(() => parseIndexes(`1-${INVALID_INDEX}`)).toThrow();
  expect(() => parseIndexes('1,1')).toThrow();
});

it('rolls back a failed per-job pause write instead of exposing an unpersisted paused state', async () => {
  const { queue } = await station();
  const job = queue.add('https://example.com/queued');
  vi.spyOn(queue.store, 'save').mockImplementationOnce(() => {
    throw new Error('Disk full');
  });
  await expect(queue.controls.command('pause', job.id)).rejects.toThrow('Disk full');
  expect(job.status).toBe(DOWNLOAD_STATUS.queued);
  await queue.controls.command('pause', job.id);
  expect(job.status).toBe(DOWNLOAD_STATUS.paused);
});
