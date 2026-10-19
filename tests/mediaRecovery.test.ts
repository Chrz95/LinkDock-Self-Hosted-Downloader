import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MEDIA_FAILURE, MEDIA_FAILURE_INFO } from '../shared/mediaFailures';
import { API_PATH, DOWNLOAD_STATUS, HTTP_STATUS } from '../shared/contracts';
import { AUDIO_QUALITY, SOURCE_TYPE, VIDEO_QUALITY } from '../shared/sources';
import { JOB_OPTIONS } from '../shared/jobOptions';
import { EngineProcessError, classifyMediaFailure } from '../server/engines/failures';
import { runEngineProcess } from '../server/engines/runProcess';
import { validateHistory } from '../server/downloads/validateHistory';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';

const URL = 'https://www.pornhub.com/view_video.php?viewkey=phoffline123';
afterEach(async () => {
  await cleanupDeliveryFixtures();
  vi.restoreAllMocks();
});

it.each([
  ['Requested format is not available', MEDIA_FAILURE.format],
  ['ERROR: No video formats found', MEDIA_FAILURE.format],
  ['HTTP Error 429: Too Many Requests', MEDIA_FAILURE.rate],
  ['HTTP Error 403: Forbidden, Cloudflare CAPTCHA', MEDIA_FAILURE.verification],
  ['HTTP Error 403: Forbidden', MEDIA_FAILURE.access],
  ['Sign in to confirm your age', MEDIA_FAILURE.login],
  ['AuthenticationError: private account', MEDIA_FAILURE.login],
  ['This video is not available in your country', MEDIA_FAILURE.region],
  ['This video has been removed', MEDIA_FAILURE.unavailable],
  ['This video is DRM-protected', MEDIA_FAILURE.drm],
  ['ffmpeg not found. Please install', MEDIA_FAILURE.utility],
  ['Unable to find PhantomJS', MEDIA_FAILURE.utility],
  ['Connection refused', MEDIA_FAILURE.network],
  ['HTTP Error 503: Service Unavailable', MEDIA_FAILURE.network],
  ['Unrecognized provider failure', MEDIA_FAILURE.unknown],
])('classifies a fixed hint without echoing diagnostic text: %s', (message, reason) => {
  expect(classifyMediaFailure(`${message} https://example.com/private?token=secret`)).toBe(reason);
  const failure = new EngineProcessError(reason);
  expect(failure.message).toBe(MEDIA_FAILURE_INFO[reason].message);
  expect(JSON.stringify(failure)).not.toContain('secret');
});

it('does not infer a reason solely from query parameters and preserves cancellation over classifications', async () => {
  expect(classifyMediaFailure('Failure at https://example.com/?captcha=1&cookies=private&drm-protected=1')).toBe(
    MEDIA_FAILURE.unknown,
  );
  const controller = new AbortController();
  const process = runEngineProcess(
    globalThis.process.execPath,
    ['-e', "process.stderr.write('Cloudflare CAPTCHA'); process.stdout.write('READY\\n'); setInterval(()=>{},1000)"],
    controller.signal,
    () => controller.abort(new Error('Paused by owner')),
  );
  await expect(process).rejects.toThrow('Paused by owner');
});

it('returns a typed safe failure from a real child process without its private stderr', async () => {
  let diagnostic = '';
  const failure = await runEngineProcess(
    process.execPath,
    ['-e', "process.stderr.write('Requested format is not available token=private-secret'); process.exit(1)"],
    new AbortController().signal,
    () => {},
    {
      onFailure: (text) => {
        diagnostic = text;
      },
    },
  ).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(EngineProcessError);
  expect(failure).toMatchObject({ reason: MEDIA_FAILURE.format });
  expect(String(failure)).not.toContain('private-secret');
  expect(diagnostic).toContain('private-secret');
  expect(failure).not.toHaveProperty('cause');
});

it('queues a separate authenticated media version using the original URL and current completion default', async () => {
  const { queue, client, login, directory } = await createDeliveryFixture();
  const original = queue.add(URL, SOURCE_TYPE.video, VIDEO_QUALITY.compact);
  original.status = DOWNLOAD_STATUS.paused;
  original.mediaFailure = MEDIA_FAILURE.format;
  queue.store.save();
  const working = `${queue.store.getFilePath(original.id)}.work`;
  mkdirSync(working);
  const partial = path.join(working, 'retained.mp4.part');
  writeFileSync(partial, 'original-partial-bytes');
  const endpoint = `${API_PATH.downloads}/${original.id}${JOB_OPTIONS.mediaCopy}`;
  await client.post(endpoint).send({ quality: AUDIO_QUALITY.high }).expect(HTTP_STATUS.unauthorized);
  await login();
  await client
    .post(endpoint)
    .set('Origin', 'https://other.example')
    .send({ quality: AUDIO_QUALITY.high })
    .expect(HTTP_STATUS.forbidden);
  queue.updateSettings({ ...queue.policy.settings, completionDirectory: 'Music' });
  const response = await client
    .post(endpoint)
    .send({ quality: AUDIO_QUALITY.high, url: 'https://evil.example' })
    .expect(HTTP_STATUS.created);
  const added = queue.store.jobs.find((job) => job.id === response.body.id)!;
  expect(added.id).not.toBe(original.id);
  expect(added.url).toBe(URL);
  expect(added.quality).toBe(AUDIO_QUALITY.high);
  expect(added.destination?.directory).toBe('Music');
  expect(added.mediaFailure).toBeUndefined();
  expect(readFileSync(partial, 'utf8')).toBe('original-partial-bytes');
  expect(original.status).toBe(DOWNLOAD_STATUS.paused);
  expect(original.quality).toBe(VIDEO_QUALITY.compact);
  expect(validateHistory(JSON.parse(readFileSync(path.join(directory, 'history.json'), 'utf8')))).toHaveLength(
    queue.store.jobs.length,
  );
});

it('rejects duplicates, invalid representations and non-video records without creating jobs', async () => {
  const { queue, client, login } = await createDeliveryFixture();
  await login();
  const original = queue.add(URL);
  const endpoint = `${API_PATH.downloads}/${original.id}${JOB_OPTIONS.mediaCopy}`;
  for (const quality of [VIDEO_QUALITY.balanced, '--exec=anything', undefined]) {
    await client.post(endpoint).send({ quality }).expect(HTTP_STATUS.conflict);
  }
  const gallery = queue.add('https://deviantart.com/artist');
  await client
    .post(`${API_PATH.downloads}/${gallery.id}${JOB_OPTIONS.mediaCopy}`)
    .send({ quality: VIDEO_QUALITY.compact })
    .expect(HTTP_STATUS.conflict);
  const expected = 2;
  expect(queue.store.jobs).toHaveLength(expected);
});

it('keeps failure categories readable across upgrades and clears them when an owner retries', async () => {
  const { queue } = await createDeliveryFixture();
  const job = queue.add(URL);
  job.status = DOWNLOAD_STATUS.failed;
  job.mediaFailure = MEDIA_FAILURE.format;
  expect(validateHistory(JSON.parse(JSON.stringify([job])))[0]?.mediaFailure).toBe(MEDIA_FAILURE.format);
  expect(() => validateHistory([{ ...job, mediaFailure: 'private diagnostic' }])).toThrow('History is invalid');
  const legacy = { ...job, mediaFailure: undefined };
  expect(validateHistory([legacy])[0]?.mediaFailure).toBeUndefined();
  queue.retry(job);
  expect(job.mediaFailure).toBeUndefined();
});

it('rolls back a failed new-version history write without touching the original job', async () => {
  const { queue, client, login } = await createDeliveryFixture();
  const original = queue.add(URL);
  const before = structuredClone(original);
  await login();
  vi.spyOn(queue.store, 'save').mockImplementationOnce(() => {
    throw new Error('Simulated storage failure');
  });
  await client
    .post(`${API_PATH.downloads}/${original.id}${JOB_OPTIONS.mediaCopy}`)
    .send({ quality: AUDIO_QUALITY.compact })
    .expect(HTTP_STATUS.conflict);
  expect(queue.store.jobs).toHaveLength(1);
  expect(original).toEqual(before);
});
