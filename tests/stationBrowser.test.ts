import { afterEach, expect, it } from 'vitest';
import { HTTP_STATUS } from '../shared/contracts';
import { STATION_BROWSER_PATH } from '../shared/stationBrowser';
import { readBrowserPage } from '../server/stationBrowser/page';
import { cleanupDeliveryFixtures, createDeliveryFixture } from './helpers/deliveryFixture';

afterEach(cleanupDeliveryFixtures);

it('extracts inert text and resolves public link candidates with their query strings', () => {
  const page = readBrowserPage(
    '<title>Files</title><base href="/releases/"><p>Select a file</p><script>hidden()</script>' +
      '<a href="test.zip?token=test&amp;v=2" download>ZIP &amp; files</a><a href="javascript:alert(1)">ignored</a>',
    'https://example.com:8443/catalog',
    false,
  );
  expect(page.title).toBe('Files');
  expect(page.text).toContain('Select a file');
  expect(page.text).not.toContain('hidden');
  expect(page.links).toEqual([
    { url: 'https://example.com:8443/releases/test.zip?token=test&v=2', label: 'ZIP & files', download: true },
  ]);
});

it('requires a station session and rejects a private address before requesting the page', async () => {
  const { client, login } = await createDeliveryFixture();
  const url = 'http://127.0.0.1/';
  await client.post(STATION_BROWSER_PATH).send({ url }).expect(HTTP_STATUS.unauthorized);
  await login();
  await client.post(STATION_BROWSER_PATH).send({ url }).expect(HTTP_STATUS.badRequest);
});
