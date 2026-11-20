import { afterEach, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { HTTP_STATUS } from '../shared/contracts';
import { STATION_BROWSER_PATH } from '../shared/stationBrowser';
import { readBrowserPage } from '../server/stationBrowser/page';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';
import * as transport from '../server/downloads/openSource';

afterEach(cleanupDeliveryFixtures);

it('keeps HTML, CSS and script elements while stripping source navigation and event attributes', async () => {
  const stylesheet = vi.fn().mockResolvedValue('p{color:blue}</StYlE><script>externalAttack()</script>');
  const page = await readBrowserPage(
    '<title>Files</title><base href="/releases/"><style>p{color:red}</style>' +
      '<link rel="stylesheet" href="page.css"><p class="files" onclick="attack()">Select a file</p>' +
      '<script>hidden()</script><iframe src="https://example.com"></iframe><meta http-equiv="refresh" content="0">' +
      '<a href="test.zip?token=test&amp;v=2" download>ZIP &amp; files</a><a href="javascript:alert(1)">ignored</a>',
    'https://example.com:8443/catalog',
    false,
    stylesheet,
  );
  expect(page.title).toBe('Files');
  expect(stylesheet).toHaveBeenCalledExactlyOnceWith('https://example.com:8443/releases/page.css', 'stylesheet');
  expect(page.html).toContain('<p class="files">Select a file</p>');
  expect(page.html).toContain('<style>p{color:red}</style>');
  expect(page.html).toContain('p{color:blue}\\3c /StYlE>');
  expect(page.html).toContain('<script>hidden()</script>');
  expect(page.html).not.toMatch(/onclick|href=|<iframe|http-equiv="refresh"|<base|<link/u);
  expect(page.links).toEqual([
    { url: 'https://example.com:8443/releases/test.zip?token=test&v=2', label: 'ZIP & files', download: true },
  ]);
});

it('serves embedded scripts through a separate authenticated response with an opaque sandbox', async () => {
  const { client, login } = await createDeliveryFixture();
  const url = 'https://example.com/page';
  const mock = vi.spyOn(transport, 'openSource').mockImplementation(async (target) => {
    const script = target.pathname === '/site.js';
    const content = script ? 'document.body.dataset.loaded = "yes";' : '<script src="/site.js" defer></script>';
    return Object.assign(Readable.from([content]), {
      headers: { 'content-type': script ? 'text/javascript' : 'text/html' },
      sourceUrl: target.href,
    }) as unknown as transport.SourceResponse;
  });
  try {
    await login();
    const page = await client.post(STATION_BROWSER_PATH).send({ url }).expect(HTTP_STATUS.ok);
    expect(page.body.html).toBeUndefined();
    const preview = await client.get(String(page.body.previewUrl)).expect(HTTP_STATUS.ok);
    expect(preview.headers['content-security-policy']).toContain('sandbox allow-scripts');
    expect(preview.headers['content-security-policy']).toContain("default-src 'none'");
    expect(preview.headers['content-security-policy']).not.toContain('allow-same-origin');
    expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.text).toContain(
      `src="data:text/javascript;base64,${Buffer.from('document.body.dataset.loaded = "yes";').toString('base64')}"`,
    );
  } finally {
    mock.mockRestore();
  }
});

it('requires a station session and rejects a private address before requesting the page', async () => {
  const { client, login } = await createDeliveryFixture();
  const url = 'http://127.0.0.1/';
  await client.post(STATION_BROWSER_PATH).send({ url }).expect(HTTP_STATUS.unauthorized);
  await login();
  await client.post(STATION_BROWSER_PATH).send({ url }).expect(HTTP_STATUS.badRequest);
});
