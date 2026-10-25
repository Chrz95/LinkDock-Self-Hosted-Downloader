import { afterEach, expect, it, vi } from 'vitest';
import { videoFailure } from '../server/engines/videoFailure';
import { MEDIA_FAILURE } from '../shared/mediaFailures';
import { runEngineProcess } from '../server/engines/runProcess';
import { mediaEnvironment } from '../server/engines/environment';

afterEach(() => vi.unstubAllEnvs());

it.each([
  'WARNING: No impersonate target is available.\nUnable to extract title',
  'Impersonate target "chrome" is not available',
  'curl_cffi is not installed',
  'curl_cffi 9.0 (unsupported)',
])('identifies missing browser support without exposing diagnostics: %s', (diagnostic) => {
  const failure = videoFailure(`${diagnostic}\nhttps://example.com/?private-token=secret`, 1);
  expect(failure.reason).toBe(MEDIA_FAILURE.utility);
  expect(failure.message).toContain('VIDEO-BROWSER-MISSING');
  expect(failure.message).not.toMatch(/private-token|secret|example\.com/);
});

it('retains a more specific source restriction over an incidental browser-support warning', () => {
  const failure = videoFailure('no impersonate target is available\nThis video is not available in your country', 1);
  expect(failure.reason).toBe(MEDIA_FAILURE.region);
});

it('does not infer missing support from URL parameters and identifies extractor parsing separately', () => {
  const diagnostic = 'Failure at https://example.com/?q=curl_cffi_unavailable';
  expect(videoFailure(diagnostic, 1).reason).toBe(MEDIA_FAILURE.unknown);
  expect(videoFailure('ERROR: Unable to extract title', 1).message).toContain('VIDEO-EXTRACT');
});

it('classifies a real failing video subprocess with fixed safe guidance', async () => {
  await expect(
    runEngineProcess(
      process.execPath,
      ['-e', "process.stderr.write('no impersonate target is available; private-cookie=secret');process.exit(1)"],
      new AbortController().signal,
      () => undefined,
      { failure: videoFailure },
    ),
  ).rejects.toMatchObject({
    reason: MEDIA_FAILURE.utility,
    message: expect.stringContaining('VIDEO-BROWSER-MISSING'),
  });
});

it('removes inherited proxy bypass variables without mutating the parent environment', () => {
  const environment = {
    PATH: '/fixed/bin',
    HTTP_PROXY: 'http://private-proxy',
    HTTPS_PROXY: 'http://private-proxy',
    ALL_PROXY: 'socks5://private-proxy',
    NO_PROXY: '*',
    http_proxy: 'http://private-proxy',
    https_proxy: 'http://private-proxy',
    all_proxy: 'socks5://private-proxy',
    no_proxy: '127.0.0.1',
    SSL_CERT_FILE: '/private/trusted-ca.pem',
  };
  expect(mediaEnvironment(environment)).toEqual({ PATH: '/fixed/bin', SSL_CERT_FILE: '/private/trusted-ca.pem' });
  expect(environment.NO_PROXY).toBe('*');
  vi.stubEnv('NO_PROXY', '*');
  expect(mediaEnvironment()).not.toHaveProperty('NO_PROXY');
});
