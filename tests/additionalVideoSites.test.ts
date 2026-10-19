import { afterEach, expect, it } from 'vitest';
import { API_PATH, DOWNLOAD_PATH, HTTP_STATUS } from '../shared/contracts';
import { AUDIO_QUALITY, SOURCE_TYPE, VIDEO_QUALITY } from '../shared/sources';
import { BROWSER_ACCESS, BROWSER_ACTION } from '../shared/browserAccess';
import { BrowserAccessStore } from '../server/browserAccess/store';
import { buildMediaArguments } from '../server/engines/mediaArguments';
import { resolveDownloadRequest } from '../server/engines/detectSource';
import { validateHistory } from '../server/downloads/validateHistory';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';

const URL = 'https://www.pornhub.com/view_video.php?viewkey=phoffline123';
const SIZE = 1_024;
afterEach(cleanupDeliveryFixtures);

it('queues Pornhub video/MP3 separately, retains quality and passes private sessions to the video engine', async () => {
  const { client, login, queue, directory } = await createDeliveryFixture();
  await login();
  await client
    .post(BROWSER_ACCESS.path)
    .send({
      action: BROWSER_ACTION.import,
      cookies: '# Netscape HTTP Cookie File\n.pornhub.com\tTRUE\t/\tTRUE\t0\tsession\toffline-test-session\n',
      userAgent: 'OwnerBrowser/fixture',
    })
    .expect(HTTP_STATUS.ok);
  const video = await client
    .post(API_PATH.downloads)
    .send({ url: URL, quality: VIDEO_QUALITY.compact })
    .expect(HTTP_STATUS.created);
  expect(video.body.sourceType).toBe(SOURCE_TYPE.video);
  expect(video.body.quality).toBe(VIDEO_QUALITY.compact);
  const review = await client
    .post(`${API_PATH.downloads}${DOWNLOAD_PATH.batchPreview}`)
    .send({
      urls: [URL, URL],
      quality: AUDIO_QUALITY.high,
    })
    .expect(HTTP_STATUS.ok);
  expect(review.body.newCount).toBe(1);
  expect(review.body.duplicates).toEqual([URL]);
  const audio = queue.add(URL, SOURCE_TYPE.auto, AUDIO_QUALITY.high);
  expect(validateHistory(JSON.parse(JSON.stringify([audio])))[0]?.quality).toBe(AUDIO_QUALITY.high);
  const browser = new BrowserAccessStore(directory).read();
  const videoArgs = buildMediaArguments(
    video.body,
    '/output',
    'http://proxy',
    SIZE,
    '/private/cookies.txt',
    0,
    browser,
  );
  expect(videoArgs).toContain('bv*[height<=720]+ba/b[height<=720]');
  expect(videoArgs).toContain('--cookies');
  expect(videoArgs).toContain('--no-playlist');
  expect(videoArgs).toContain('OwnerBrowser/fixture');
  expect(videoArgs).not.toContain('offline-test-session');
  const audioArgs = buildMediaArguments(audio, '/output', 'http://proxy', SIZE);
  expect(audioArgs).toContain('--extract-audio');
  expect(audioArgs).toContain('320K');
  expect(audioArgs.at(-1)).toBe(URL);
});

it('keeps similar domain names out of automatic routing and honors explicit Direct file mode', () => {
  for (const url of [
    'https://pornhub.com.other.example/view_video.php?viewkey=phoffline123',
    'https://notpornhub.com/video',
    'https://xvideos.com.other.example/video12345/example',
    'https://notxnxx.com/video12345/example',
  ]) {
    expect(resolveDownloadRequest(url, SOURCE_TYPE.auto, undefined).sourceType).toBe(SOURCE_TYPE.direct);
  }
  expect(resolveDownloadRequest(URL, SOURCE_TYPE.direct, undefined).sourceType).toBe(SOURCE_TYPE.direct);
  expect(
    resolveDownloadRequest('https://www.pornhub.net/embed/phoffline123', SOURCE_TYPE.auto, undefined).sourceType,
  ).toBe(SOURCE_TYPE.video);
  expect(
    resolveDownloadRequest('https://de.pornhub.com/view_video.php?viewkey=phoffline123', undefined, undefined)
      .sourceType,
  ).toBe(SOURCE_TYPE.video);
});
