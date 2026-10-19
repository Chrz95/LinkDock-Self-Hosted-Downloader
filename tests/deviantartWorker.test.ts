import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { DownloadQueue } from '../server/downloads/queue';
import { DOWNLOAD_STATUS } from '../shared/contracts';
import { downloadMedia } from '../server/engines/media';
import { runEngineProcess } from '../server/engines/runProcess';
import { createPublicProxy } from '../server/engines/publicProxy';
import { DeviantartStore } from '../server/deviantart/store';
import { BrowserAccessStore } from '../server/browserAccess/store';
import { tryDeviantartLock } from '../server/deviantart/lock';
import { DEVIANTART, DEVIANTART_ACTION } from '../shared/deviantart';
import { HTTP_STATUS } from '../shared/contracts';
import { MEDIA_FAILURE } from '../shared/mediaFailures';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';

vi.mock('../server/engines/runProcess', () => ({ runEngineProcess: vi.fn() }));
vi.mock('../server/engines/publicProxy', () => ({ createPublicProxy: vi.fn() }));
const REFRESH_TOKEN = 'private-worker-token';
const close = vi.fn();
afterEach(async () => {
  await cleanupDeliveryFixtures();
  vi.mocked(runEngineProcess).mockReset();
  vi.mocked(createPublicProxy).mockReset();
  close.mockReset();
});

it('keeps config/cache private and cleans credentials and locks on worker failure', async () => {
  const { directory, configuration, queue, login, client } = await createDeliveryFixture();
  await login();
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.account, refreshToken: REFRESH_TOKEN })
    .expect(HTTP_STATUS.ok);
  vi.mocked(createPublicProxy).mockResolvedValue({ url: 'http://proxy.example', close });
  let privateConfig = '';
  vi.mocked(runEngineProcess).mockImplementation(async (_command, args, _signal, _progress, options) => {
    privateConfig = args[args.indexOf('--config') + 1]!;
    expect(readFileSync(privateConfig, 'utf8')).toContain(REFRESH_TOKEN);
    expect(JSON.stringify(args)).not.toContain(REFRESH_TOKEN);
    expect(options?.authenticationMessage).toContain('refresh token');
    expect(tryDeviantartLock(directory)).toBeNull();
    throw new Error('Offline worker failure');
  });
  const job = queue.add('https://deviantart.com/artist');
  await expect(
    downloadMedia(job, queue.store.filesDirectory, new AbortController().signal, configuration),
  ).rejects.toThrow('Offline worker failure');
  expect(existsSync(privateConfig)).toBe(false);
  expect(close).toHaveBeenCalledOnce();
  expect(readdirSync(path.join(directory, 'credentials')).some((name) => name.startsWith('session-'))).toBe(false);
  const release = tryDeviantartLock(directory);
  expect(release).not.toBeNull();
  release?.();
});

it('cancels a queued source worker before engine startup while protecting the running account', async () => {
  const { directory, configuration, queue, login, client } = await createDeliveryFixture();
  await login();
  vi.mocked(createPublicProxy).mockResolvedValue({ url: 'http://proxy.example', close });
  let finish: (() => void) | undefined;
  vi.mocked(runEngineProcess).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const first = queue.add('https://deviantart.com/artist/gallery');
  const running = downloadMedia(first, queue.store.filesDirectory, new AbortController().signal, configuration);
  await vi.waitFor(() => expect(runEngineProcess).toHaveBeenCalledOnce());
  const controller = new AbortController();
  const second = queue.add('https://deviantart.com/another/gallery');
  const waiting = downloadMedia(second, queue.store.filesDirectory, controller.signal, configuration);
  expect(second.stage).toBe('Waiting for DeviantArt account');
  const failure = expect(waiting).rejects.toThrow('Paused');
  controller.abort(new Error('Paused'));
  await failure;
  expect(runEngineProcess).toHaveBeenCalledOnce();
  await client.post(DEVIANTART.path).send({ action: DEVIANTART_ACTION.clear }).expect(HTTP_STATUS.conflict);
  finish?.();
  await running;
  await client.post(DEVIANTART.path).send({ action: DEVIANTART_ACTION.clear }).expect(HTTP_STATUS.ok);
  const release = tryDeviantartLock(directory);
  expect(release).not.toBeNull();
  release?.();
});

it('releases the account when corrupt private state prevents worker preparation', async () => {
  const { directory, configuration, queue } = await createDeliveryFixture();
  const job = queue.add('https://deviantart.com/artist');
  const store = new DeviantartStore(directory);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(store.filename, '{ broken');
  await expect(
    downloadMedia(job, queue.store.filesDirectory, new AbortController().signal, configuration),
  ).rejects.toThrow('unreadable');
  expect(runEngineProcess).not.toHaveBeenCalled();
  const release = tryDeviantartLock(directory);
  expect(release).not.toBeNull();
  release?.();
});

it('uses the pinned job choices after global collection defaults change', async () => {
  const { directory, configuration, queue } = await createDeliveryFixture();
  const job = queue.add('https://deviantart.com/artist');
  const source = new DeviantartStore(directory);
  source.save({ ...source.read(), include: ['scraps'], stories: 'none', original: false });
  vi.mocked(createPublicProxy).mockResolvedValue({ url: 'http://proxy.example', close });
  vi.mocked(runEngineProcess).mockImplementation(async (_command, args) => {
    expect(args).toContain('extractor.deviantart.include=gallery,journal');
    expect(args).toContain('extractor.deviantart.journals=text');
    expect(args).toContain('extractor.deviantart.original=true');
  });
  await downloadMedia(job, queue.store.filesDirectory, new AbortController().signal, configuration);
  expect(runEngineProcess).toHaveBeenCalledOnce();
});

it('marks an upstream rate-limit loop failed, persists the safe reason and releases account ownership', async () => {
  const { directory, configuration, queue } = await createDeliveryFixture();
  vi.mocked(createPublicProxy).mockResolvedValue({ url: 'http://proxy.example', close });
  vi.mocked(runEngineProcess).mockImplementation(async (_command, _args, signal, _progress, options) => {
    options?.onDiagnostic?.('[deviantart][warning] API responded with 429 Too Many Requests. Using 30s delay.');
    signal.throwIfAborted();
  });
  writeFileSync(path.join(directory, 'controls.json'), JSON.stringify({ paused: true, tasks: [] }));
  const job = queue.add('https://deviantart.com/artist');
  const running = new DownloadQueue(configuration);
  try {
    await running.controls.command('resume', 'all');
    await vi.waitFor(() => expect(running.store.jobs[0]?.status).toBe(DOWNLOAD_STATUS.failed));
    expect(running.store.jobs[0]?.mediaFailure).toBe(MEDIA_FAILURE.rate);
    const [saved] = JSON.parse(readFileSync(path.join(directory, 'history.json'), 'utf8'));
    expect(saved.id).toBe(job.id);
    expect(saved.mediaFailure).toBe(MEDIA_FAILURE.rate);
    expect(saved.errorMessage).toBe('The source is limiting download requests.');
    expect(saved.stage).not.toContain('429');
    const release = tryDeviantartLock(directory);
    expect(release).not.toBeNull();
    release?.();
  } finally {
    await running.stop();
  }
});

it('pins an empty legacy job durably before the first recovered worker writes any output', async () => {
  const { directory, configuration, queue } = await createDeliveryFixture();
  const original = queue.add('https://deviantart.com/artist');
  delete original.deviantart;
  queue.store.save();
  writeFileSync(path.join(directory, 'controls.json'), JSON.stringify({ paused: true, tasks: [] }));
  const source = new DeviantartStore(directory);
  source.save({ ...source.read(), include: ['scraps'], stories: 'none', original: false });
  vi.mocked(createPublicProxy).mockResolvedValue({ url: 'http://proxy.example', close });
  vi.mocked(runEngineProcess).mockImplementation(async (_command, args) => {
    const [saved] = JSON.parse(readFileSync(path.join(directory, 'history.json'), 'utf8'));
    expect(saved.deviantart).toEqual({ include: ['scraps'], stories: 'none', original: false });
    expect(args).toContain('extractor.deviantart.include=scraps');
    writeFileSync(path.join(args[args.indexOf('--destination') + 1]!, 'image.jpg'), 'recovered-output');
  });
  const recovered = new DownloadQueue(configuration);
  try {
    await recovered.controls.command('resume', 'all');
    await vi.waitFor(() => expect(recovered.store.jobs[0]?.status).toBe(DOWNLOAD_STATUS.completed));
    expect(runEngineProcess).toHaveBeenCalledOnce();
  } finally {
    await recovered.stop();
  }
});

it('retains OAuth, imported cookies and rotation cache after a browser verification block', async () => {
  const { directory, configuration, queue, login, client } = await createDeliveryFixture();
  await login();
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.account, refreshToken: REFRESH_TOKEN })
    .expect(HTTP_STATUS.ok);
  const { account } = new DeviantartStore(directory).read();
  const browser = new BrowserAccessStore(directory);
  const cookies = '# Netscape HTTP Cookie File\n.deviantart.com\tTRUE\t/\tTRUE\t0\tauth\tprivate-cookie\n';
  browser.save({ ...browser.read(), cookies, userAgent: 'Browser/1' });
  vi.mocked(createPublicProxy).mockResolvedValue({ url: 'http://proxy.example', close });
  let cookiePath = '';
  let cachePath = '';
  vi.mocked(runEngineProcess).mockImplementation(async (_command, args, signal, _progress, options) => {
    cookiePath = args[args.indexOf('--cookies') + 1]!;
    cachePath = args[args.indexOf('--cache-file') + 1]!;
    expect(readFileSync(cookiePath, 'utf8')).toBe(cookies);
    expect(readFileSync(args[args.indexOf('--config') + 1]!, 'utf8')).toContain(REFRESH_TOKEN);
    expect(args[args.indexOf('--user-agent') + 1]).toBe('Browser/1');
    expect(JSON.stringify(args)).not.toMatch(/private-worker-token|private-cookie/);
    writeFileSync(cachePath, 'retained-rotation-cache');
    options?.onDiagnostic?.('[deviantart][info] Waiting 300 seconds (CloudFront block)');
    signal.throwIfAborted();
  });
  const job = queue.add('https://www.deviantart.com/artist/gallery');
  await expect(
    downloadMedia(job, queue.store.filesDirectory, new AbortController().signal, configuration),
  ).rejects.toMatchObject({ reason: MEDIA_FAILURE.verification });
  expect(new DeviantartStore(directory).read().account).toEqual(account);
  expect(new BrowserAccessStore(directory).read().cookies).toBe(cookies);
  expect(readFileSync(cachePath, 'utf8')).toBe('retained-rotation-cache');
  expect(existsSync(cookiePath)).toBe(false);
  const release = tryDeviantartLock(directory);
  expect(release).not.toBeNull();
  release?.();
});
