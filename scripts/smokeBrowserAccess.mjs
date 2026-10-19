import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BROWSER_ACCESS, BROWSER_ACTION } from '../dist-server/shared/browserAccess.js';
import { BrowserAccessStore } from '../dist-server/server/browserAccess/store.js';
import { sourceAccess, browserHeaders } from '../dist-server/server/browserAccess/headers.js';
import { prepareMediaCookies } from '../dist-server/server/engines/cookies.js';
import { HTTP_STATUS, API_PATH } from '../dist-server/shared/contracts.js';
import { SOURCE_TYPE, AUDIO_QUALITY, VIDEO_QUALITY } from '../dist-server/shared/sources.js';
import { buildMediaArguments } from '../dist-server/server/engines/mediaArguments.js';

/**
 * Exercises compiled session import, private engine copies and redirect-scoped headers without remote credentials.
 * @param {object} configuration - Temporary production configuration.
 * @param {object} client - Authenticated real application agent.
 * @returns {Promise<void>} Native browser-session boundary checks passed.
 */
export async function smokeBrowserAccess(configuration, client) {
  const cookies = '# Netscape HTTP Cookie File\nsource.example\tFALSE\t/\tTRUE\t0\tverified\tcompiled-owned\n';
  const result = await client
    .post(BROWSER_ACCESS.path)
    .send({
      action: BROWSER_ACTION.import,
      cookies,
      userAgent: 'Browser/compiled',
    })
    .expect(HTTP_STATUS.ok);
  assert.equal(result.body.hasCookies, true);
  assert.ok(!JSON.stringify(result.body).includes('compiled-owned'));
  const state = new BrowserAccessStore(configuration.dataDirectory).read();
  const access = sourceAccess(state, () => undefined);
  assert.equal(browserHeaders(access, new URL('https://source.example/file')).Cookie, 'verified=compiled-owned');
  assert.equal(browserHeaders(access, new URL('https://other.example/file')).Cookie, undefined);
  const session = await prepareMediaCookies(configuration.dataDirectory, undefined, state.cookies);
  assert.equal(readFileSync(session.filename, 'utf8'), cookies);
  await session.cleanup();
  assert.equal(existsSync(session.filename), false);
  await client.post(BROWSER_ACCESS.path).send({ action: BROWSER_ACTION.clear }).expect(HTTP_STATUS.ok);
  assert.equal(new BrowserAccessStore(configuration.dataDirectory).snapshot().hasCookies, false);
  const gallery = await client
    .post(API_PATH.downloads)
    .send({
      url: 'https://www.deviantart.com/artist/gallery/',
      sourceType: SOURCE_TYPE.deviantart,
    })
    .expect(HTTP_STATUS.created);
  assert.equal(gallery.body.sourceType, SOURCE_TYPE.deviantart);
  const argumentsList = buildMediaArguments(
    gallery.body,
    '/fixture',
    'http://proxy.example',
    configuration.maximumFileBytes,
  );
  assert.ok(argumentsList.includes('extractor.deviantart.journals=text'));
  assert.ok(argumentsList.includes('--destination'));
  await client.post(`${API_PATH.downloads}/${gallery.body.id}/cancel`).send({}).expect(HTTP_STATUS.noContent);
  await client.delete(`${API_PATH.downloads}/${gallery.body.id}`).send({}).expect(HTTP_STATUS.noContent);
  for (const quality of [VIDEO_QUALITY.compact, AUDIO_QUALITY.high]) {
    const media = await client
      .post(API_PATH.downloads)
      .send({
        url: 'https://www.pornhub.com/view_video.php?viewkey=phoffline123',
        quality,
      })
      .expect(HTTP_STATUS.created);
    assert.equal(media.body.sourceType, SOURCE_TYPE.video);
    assert.equal(media.body.quality, quality);
    const mediaArgs = buildMediaArguments(
      media.body,
      '/fixture',
      'http://proxy.example',
      configuration.maximumFileBytes,
    );
    assert.ok(mediaArgs.includes(quality === AUDIO_QUALITY.high ? '320K' : 'bv*[height<=720]+ba/b[height<=720]'));
    await client.post(`${API_PATH.downloads}/${media.body.id}/cancel`).send({}).expect(HTTP_STATUS.noContent);
    await client.delete(`${API_PATH.downloads}/${media.body.id}`).send({}).expect(HTTP_STATUS.noContent);
  }
  process.stdout.write('Compiled browser-session import, private copies, scoped headers and removal: passed.\n');
}
