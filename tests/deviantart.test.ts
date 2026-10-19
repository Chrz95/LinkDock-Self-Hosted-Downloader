import { afterEach, expect, it, vi } from 'vitest';
import { resolveDownloadRequest } from '../server/engines/detectSource';
import { buildMediaArguments } from '../server/engines/mediaArguments';
import { validateHistory } from '../server/downloads/validateHistory';
import { SOURCE_TYPE, AUDIO_QUALITY } from '../shared/sources';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';

const SIZE = 1_024;
const OPTION_TERMINATOR_POSITION = -2;
afterEach(async () => {
  await cleanupDeliveryFixtures();
  vi.restoreAllMocks();
});
it.each([
  'https://www.deviantart.com/artist/art/Example-123456',
  'https://www.deviantart.com/artist/journal/Story-123456',
  'https://www.deviantart.com/artist/gallery/',
  'https://www.deviantart.com/artist/gallery/12345/Folder',
  'https://www.deviantart.com/artist/posts/journals/',
  'https://www.deviantart.com/artist',
  'https://artist.deviantart.com/',
  'https://fav.me/d12345',
])('routes DeviantArt content through the mixed-media collector: %s', (url) => {
  expect(resolveDownloadRequest(url, SOURCE_TYPE.auto, undefined).sourceType).toBe(SOURCE_TYPE.deviantart);
  expect(resolveDownloadRequest(url, SOURCE_TYPE.deviantart, undefined).sourceType).toBe(SOURCE_TYPE.deviantart);
});

it('rejects incompatible hosts/MP3 and distinguishes lookalike domains from DeviantArt', () => {
  expect(() => resolveDownloadRequest('https://other.example/gallery', SOURCE_TYPE.deviantart, undefined)).toThrow();
  expect(() => resolveDownloadRequest('https://deviantart.com/', SOURCE_TYPE.auto, undefined)).toThrow('homepage');
  expect(() =>
    resolveDownloadRequest('https://deviantart.com/artist/gallery', SOURCE_TYPE.auto, AUDIO_QUALITY.balanced),
  ).toThrow('MP3');
  expect(
    resolveDownloadRequest('https://deviantart.com.evil.example/file', SOURCE_TYPE.auto, undefined).sourceType,
  ).toBe(SOURCE_TYPE.direct);
});

it('builds safe gallery, original-media and text-story arguments', async () => {
  const { queue } = await createDeliveryFixture();
  const job = queue.add('https://deviantart.com/artist');
  const args = buildMediaArguments(job, '/data/output', 'http://proxy.example', SIZE, '/private/cookies.txt');
  expect(args).toContain('--destination');
  expect(args[args.indexOf('--destination') + 1]).toBe('/data/output');
  expect(args).toContain('extractor.deviantart.journals=text');
  expect(args).toContain('extractor.deviantart.original=true');
  expect(args).toContain('extractor.deviantart.flat=false');
  expect(args).toContain('extractor.deviantart.include=gallery,journal');
  expect(args).toContain('extractor.deviantart.auto-unwatch=false');
  expect(args).toContain(':memory:');
  expect(args).not.toContain('--no-playlist');
  expect(args.at(-1)).toBe(job.url);
  expect(args.at(OPTION_TERMINATOR_POSITION)).toBe('--');
  expect(validateHistory(JSON.parse(JSON.stringify([job])))[0]?.sourceType).toBe(SOURCE_TYPE.deviantart);
});
