import { expect, it } from 'vitest';
import { resolveDownloadRequest } from '../server/engines/detectSource';
import { createQueuedJob, reviewBatch } from '../server/downloads/batch';
import { validateHistory } from '../server/downloads/validateHistory';
import { mediaFormatArguments } from '../server/engines/mediaFormat';
import { AUDIO_QUALITY, VIDEO_QUALITY } from '../shared/sources';

it('selects every video height as a strict source ceiling and keeps best available separate', () => {
  for (const quality of Object.values(VIDEO_QUALITY)) {
    const request = resolveDownloadRequest('https://youtube.com/watch?v=test', 'video', quality);
    const args = mediaFormatArguments(request.quality);
    expect(args).toContain(
      quality === VIDEO_QUALITY.original ? 'bv*+ba/b' : `bv*[height<=${quality}]+ba/b[height<=${quality}]`,
    );
    expect(args).not.toContain('--extract-audio');
  }
});
it('requests actual MP3 conversion at each whitelisted bitrate and preserves it across history reloads', () => {
  const rates = { 'mp3-128': '128K', 'mp3-192': '192K', 'mp3-320': '320K' } as const;
  for (const quality of Object.values(AUDIO_QUALITY)) {
    const request = resolveDownloadRequest('https://youtube.com/watch?v=test', 'video', quality);
    const job = createQueuedJob(request);
    const args = mediaFormatArguments(job.quality);
    expect(args).toEqual([
      '--format',
      'ba/b',
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      rates[quality],
      '--no-keep-video',
    ]);
    expect(args).not.toContain('--merge-output-format');
    expect(validateHistory(JSON.parse(JSON.stringify([job])))[0]?.quality).toBe(quality);
  }
});
it('keeps video, MP3 and different MP3 bitrates distinct during batch duplicate review', () => {
  const url = 'https://youtu.be/example';
  const video = createQueuedJob(resolveDownloadRequest(url, 'video', VIDEO_QUALITY.balanced));
  const audio = reviewBatch([url], 'video', AUDIO_QUALITY.balanced, [video]);
  expect(audio.unique).toHaveLength(1);
  const saved = createQueuedJob(audio.unique[0]!);
  expect(reviewBatch([url], 'video', AUDIO_QUALITY.high, [video, saved]).unique).toHaveLength(1);
  expect(reviewBatch([url], 'video', AUDIO_QUALITY.balanced, [saved]).duplicates).toHaveLength(1);
});
it('routes direct media in Auto through extraction while rejecting MP3 on non-media engines', () => {
  expect(resolveDownloadRequest('https://example.com/clip.mp4', 'auto', AUDIO_QUALITY.balanced).sourceType).toBe(
    'video',
  );
  for (const source of ['direct', 'torrent']) {
    expect(() => resolveDownloadRequest('https://example.com/clip.mp4', source, AUDIO_QUALITY.balanced)).toThrow();
  }
  expect(() => resolveDownloadRequest('https://instagram.com/reel/test/', 'auto', AUDIO_QUALITY.balanced)).toThrow(
    'Video',
  );
  expect(resolveDownloadRequest('https://instagram.com/reel/test/', 'video', AUDIO_QUALITY.balanced).sourceType).toBe(
    'video',
  );
  expect(() => resolveDownloadRequest('https://youtu.be/test', 'video', '--exec=anything')).toThrow();
});
