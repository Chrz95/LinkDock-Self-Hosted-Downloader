import { describe, expect, it } from 'vitest';
import { resolveDownloadRequest } from '../server/engines/detectSource';
import { SOURCE_TYPE } from '../shared/sources';

const INFO_HASH = '0123456789abcdef0123456789abcdef01234567';

describe('source routing and validation', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc', SOURCE_TYPE.video],
    ['https://youtu.be/abc', SOURCE_TYPE.video],
    ['https://player.vimeo.com/video/abc', SOURCE_TYPE.video],
    ['https://www.instagram.com/p/abc/', SOURCE_TYPE.instagram],
    ['https://www.instagram.com/reel/abc/', SOURCE_TYPE.instagram],
    ['https://example.com/linux.torrent?token=example', SOURCE_TYPE.torrent],
    ['https://example.com/archive.zip', SOURCE_TYPE.direct],
    ['https://youtube.com.evil.example/file', SOURCE_TYPE.direct],
  ])('selects the correct engine for %s', (url, sourceType) => {
    expect(resolveDownloadRequest(url, undefined, undefined).sourceType).toBe(sourceType);
  });
  it('recognizes magnets and preserves their tracker parameters as data', () => {
    const url = `magnet:?xt=urn:btih:${INFO_HASH}&dn=Ubuntu&tr=udp%3A%2F%2Ftracker.example%3A80`;
    const request = resolveDownloadRequest(url, SOURCE_TYPE.auto, undefined);
    expect(request.sourceType).toBe(SOURCE_TYPE.magnet);
    expect(request.filename).toBe('Ubuntu');
    expect(request.url).toContain('tracker.example');
  });
  it.each([
    ['magnet:?xt=urn:btih:invalid', SOURCE_TYPE.auto, undefined],
    ['file:///etc/passwd', SOURCE_TYPE.video, undefined],
    ['https://example.com/file', SOURCE_TYPE.magnet, undefined],
    ['https://example.com/photo', SOURCE_TYPE.instagram, undefined],
    ['https://www.instagram.com/username/', SOURCE_TYPE.auto, undefined],
    ['https://example.com/file', 'unsupported', undefined],
    ['https://example.com/file', SOURCE_TYPE.video, 'injected-format'],
  ])('rejects unsupported or malformed request %s', (url, sourceType, quality) => {
    expect(() => resolveDownloadRequest(url, sourceType, quality)).toThrow();
  });
  it('allows explicit video extraction for a supported site outside the automatic domain list', () => {
    expect(resolveDownloadRequest('https://example.com/watch/abc', SOURCE_TYPE.video, '720').quality).toBe('720');
  });
});
