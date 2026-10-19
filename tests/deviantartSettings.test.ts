import { existsSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DEVIANTART, DEVIANTART_ACTION, defaultDeviantartPreferences } from '../shared/deviantart';
import { HTTP_STATUS } from '../shared/contracts';
import { SOURCE_TYPE } from '../shared/sources';
import { DeviantartStore } from '../server/deviantart/store';
import { prepareDeviantartSession } from '../server/deviantart/session';
import { acquireDeviantartLock, tryDeviantartLock } from '../server/deviantart/lock';
import { buildMediaArguments } from '../server/engines/mediaArguments';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';

const ACCOUNT = { refreshToken: 'fresh-private-token', clientId: '12345', clientSecret: 'private-app-secret' };
const MODE_MASK = 0o777;
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const SIZE = 1_024;
afterEach(cleanupDeliveryFixtures);

it('requires a same-origin owner session and returns only non-secret account metadata', async () => {
  const { client, login, directory } = await createDeliveryFixture();
  await client.get(DEVIANTART.path).expect(HTTP_STATUS.unauthorized);
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.account, ...ACCOUNT })
    .expect(HTTP_STATUS.unauthorized);
  await login();
  await client
    .post(DEVIANTART.path)
    .set('Origin', 'https://other.example')
    .send({ action: DEVIANTART_ACTION.account, ...ACCOUNT })
    .expect(HTTP_STATUS.forbidden);
  const result = await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.account, ...ACCOUNT })
    .expect(HTTP_STATUS.ok);
  expect(result.body).toMatchObject({ ...defaultDeviantartPreferences(), hasAccount: true, customClient: true });
  expect(result.headers['cache-control']).toBe('no-store');
  expect(JSON.stringify(result.body)).not.toMatch(/fresh-private|private-app|12345/);
  const store = new DeviantartStore(directory);
  expect(store.read().account).toMatchObject(ACCOUNT);
  expect(statSync(store.filename).mode & MODE_MASK).toBe(FILE_MODE);
  expect(statSync(store.directory).mode & MODE_MASK).toBe(DIRECTORY_MODE);
  expect(readFileSync(path.join(directory, 'history.json'), 'utf8')).not.toContain(ACCOUNT.refreshToken);
  await client.get('/credentials/deviantart/settings.json').expect(HTTP_STATUS.notFound);
});

it('validates every preference/token field without overwriting existing settings or revealing secrets', async () => {
  const { client, login, directory } = await createDeliveryFixture();
  await login();
  for (const body of [
    { action: DEVIANTART_ACTION.account, refreshToken: 'bad\nsecret' },
    { action: DEVIANTART_ACTION.account, refreshToken: 'x'.repeat(DEVIANTART.maximumTokenCharacters + 1) },
    { action: DEVIANTART_ACTION.account, ...ACCOUNT, clientSecret: '' },
    { action: DEVIANTART_ACTION.account, ...ACCOUNT, clientId: '--exec' },
    { action: DEVIANTART_ACTION.preferences, ...defaultDeviantartPreferences(), include: [] },
    { action: DEVIANTART_ACTION.preferences, ...defaultDeviantartPreferences(), include: ['gallery', 'gallery'] },
    { action: DEVIANTART_ACTION.preferences, ...defaultDeviantartPreferences(), include: ['auto-unwatch'] },
    { action: DEVIANTART_ACTION.preferences, ...defaultDeviantartPreferences(), original: 'true' },
    { action: DEVIANTART_ACTION.preferences, ...defaultDeviantartPreferences(), stories: 'execute' },
    { action: 'execute', command: 'arbitrary' },
  ]) {
    const failure = await client.post(DEVIANTART.path).send(body).expect(HTTP_STATUS.badRequest);
    expect(JSON.stringify(failure.body)).not.toContain('secret');
    expect(new DeviantartStore(directory).snapshot()).toMatchObject({
      ...defaultDeviantartPreferences(),
      hasAccount: false,
    });
  }
});

it('persists scoped collection choices and keeps tokens solely in disposable private configuration', async () => {
  const { client, login, directory, queue } = await createDeliveryFixture();
  await login();
  const preferences = { include: ['scraps', 'favorite', 'status'], original: false, stories: 'html' };
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.preferences, ...preferences })
    .expect(HTTP_STATUS.ok);
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.account, ...ACCOUNT })
    .expect(HTTP_STATUS.ok);
  const session = await prepareDeviantartSession(directory);
  const config = JSON.parse(readFileSync(session.configFile!, 'utf8'));
  expect(config.extractor.deviantart).toEqual({
    'refresh-token': ACCOUNT.refreshToken,
    'client-id': ACCOUNT.clientId,
    'client-secret': ACCOUNT.clientSecret,
    public: false,
  });
  expect(statSync(session.configFile!).mode & MODE_MASK).toBe(FILE_MODE);
  expect(statSync(session.cacheFile!).mode & MODE_MASK).toBe(FILE_MODE);
  expect(session.configFile).not.toContain(queue.store.filesDirectory);
  const job = queue.add('https://deviantart.com/artist');
  const args = buildMediaArguments(job, '/output', 'http://proxy', SIZE, undefined, 0, undefined, session);
  expect(args).toContain('extractor.deviantart.include=scraps,favorite,status');
  expect(args).toContain('extractor.deviantart.journals=html');
  expect(args).toContain('extractor.deviantart.original=false');
  expect(args[args.indexOf('--config') + 1]).toBe(session.configFile);
  expect(args[args.indexOf('--cache-file') + 1]).toBe(session.cacheFile);
  expect(args).toContain('extractor.deviantart.auto-unwatch=false');
  expect(args.at(-1)).toBe(job.url);
  expect(JSON.stringify(args)).not.toMatch(/fresh-private|private-app|12345/);
  const instagram = buildMediaArguments(
    { ...job, sourceType: SOURCE_TYPE.instagram },
    '/out',
    'http://p',
    SIZE,
    undefined,
    0,
    undefined,
    session,
  );
  expect(instagram).toContain(':memory:');
  expect(instagram).not.toContain(session.configFile);
  writeFileSync(session.cacheFile!, 'simulated-rotated-cache');
  await session.cleanup();
  expect(existsSync(session.configFile!)).toBe(false);
  const resumed = await prepareDeviantartSession(directory);
  expect(resumed.cacheFile).toBe(session.cacheFile);
  expect(readFileSync(resumed.cacheFile!, 'utf8')).toBe('simulated-rotated-cache');
  await resumed.cleanup();
  await client.post(DEVIANTART.path).send({ action: DEVIANTART_ACTION.clear }).expect(HTTP_STATUS.ok);
  expect(existsSync(session.cacheFile!)).toBe(false);
  expect(new DeviantartStore(directory).snapshot()).toMatchObject({ ...preferences, hasAccount: false });
});

it('supports the bundled OAuth app and starts fresh cache generations on credential replacement', async () => {
  const { client, login, directory } = await createDeliveryFixture();
  await login();
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.account, refreshToken: ACCOUNT.refreshToken })
    .expect(HTTP_STATUS.ok);
  const first = await prepareDeviantartSession(directory);
  expect(JSON.parse(readFileSync(first.configFile!, 'utf8')).extractor.deviantart).toEqual({
    'refresh-token': ACCOUNT.refreshToken,
    public: false,
  });
  await first.cleanup();
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.account, refreshToken: 'new-fresh-token' })
    .expect(HTTP_STATUS.ok);
  const second = await prepareDeviantartSession(directory);
  expect(second.cacheFile).not.toBe(first.cacheFile);
  expect(existsSync(first.cacheFile!)).toBe(false);
  expect(readFileSync(second.cacheFile!, 'utf8')).toBe('');
  await second.cleanup();
});

it('serializes transfer access, cancels waiting workers and rejects account replacement while reserved', async () => {
  const { client, login, directory } = await createDeliveryFixture();
  await login();
  const release = await acquireDeviantartLock(directory, new AbortController().signal);
  try {
    expect(tryDeviantartLock(directory)).toBeNull();
    const controller = new AbortController();
    const canceled = acquireDeviantartLock(directory, controller.signal);
    const failure = expect(canceled).rejects.toThrow('Paused');
    controller.abort(new Error('Paused'));
    await failure;
    await client
      .post(DEVIANTART.path)
      .send({ action: DEVIANTART_ACTION.account, ...ACCOUNT })
      .expect(HTTP_STATUS.conflict);
    await client.post(DEVIANTART.path).send({ action: DEVIANTART_ACTION.clear }).expect(HTTP_STATUS.conflict);
    await client
      .post(DEVIANTART.path)
      .send({ action: DEVIANTART_ACTION.preferences, ...defaultDeviantartPreferences(), stories: 'none' })
      .expect(HTTP_STATUS.ok);
    const next = acquireDeviantartLock(directory, new AbortController().signal);
    release();
    const releaseNext = await next;
    expect(tryDeviantartLock(directory)).toBeNull();
    releaseNext();
    releaseNext();
  } finally {
    release();
  }
  const available = tryDeviantartLock(directory);
  expect(available).not.toBeNull();
  available?.();
});

it('fails closed on damaged state/cache paths and supports an explicit owner reset', async () => {
  const { client, login, directory } = await createDeliveryFixture();
  await login();
  await client
    .post(DEVIANTART.path)
    .send({ action: DEVIANTART_ACTION.account, ...ACCOUNT })
    .expect(HTTP_STATUS.ok);
  const session = await prepareDeviantartSession(directory);
  await session.cleanup();
  const outside = path.join(directory, 'outside.txt');
  writeFileSync(outside, 'untouched');
  const { unlinkSync } = await import('node:fs');
  unlinkSync(session.cacheFile!);
  symlinkSync(outside, session.cacheFile!);
  await expect(prepareDeviantartSession(directory)).rejects.toThrow('regular file');
  expect(readFileSync(outside, 'utf8')).toBe('untouched');
  const store = new DeviantartStore(directory);
  writeFileSync(store.filename, '{ damaged private-secret');
  expect(() => store.read()).toThrow('unreadable');
  await client.get(DEVIANTART.path).expect(HTTP_STATUS.conflict);
  await client.post(DEVIANTART.path).send({ action: DEVIANTART_ACTION.clear }).expect(HTTP_STATUS.ok);
  expect(store.snapshot().hasAccount).toBe(false);
  expect(existsSync(session.cacheFile!)).toBe(false);
  expect(readFileSync(outside, 'utf8')).toBe('untouched');
});
