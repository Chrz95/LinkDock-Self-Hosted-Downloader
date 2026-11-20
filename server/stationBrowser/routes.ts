import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { HTTP_STATUS } from '../../shared/contracts.js';
import { STATION_BROWSER_PATH } from '../../shared/stationBrowser.js';
import { openSource } from '../downloads/openSource.js';
import { parseTargetUrl } from '../security/target.js';
import { PREVIEW_CSP, readBrowserPage, type BrowserAsset, type BrowserDocument } from './page.js';
import type { IncomingMessage } from 'node:http';

const PAGE_LIMIT = { bytes: 524_288, assetBytes: 131_072, milliseconds: 12_000, concurrent: 2 } as const;
const PREVIEW_CACHE = { entries: 20, lifetimeMilliseconds: 1_800_000 } as const;
const ASSET_TYPE = {
  stylesheet: /^text\/css(?:\s*;|$)/iu,
  script: /^(?:text|application)\/(?:x-)?(?:java|ecma)script(?:\s*;|$)/iu,
};

/** Reads a capped UTF-8 response and closes its stream.
 * @param {IncomingMessage} source - Page or stylesheet response.
 * @param {number} limit - Maximum captured bytes.
 * @returns {Promise<{body: string, truncated: boolean}>} Captured text and truncation state.
 */
async function readBody(source: IncomingMessage, limit: number): Promise<{ body: string; truncated: boolean }> {
  if (source.headers['content-encoding'] && source.headers['content-encoding'] !== 'identity') {
    throw new Error('Unsupported page encoding.');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;
  for await (const chunk of source) {
    const buffer = Buffer.from(chunk);
    const remaining = limit - bytes;
    chunks.push(buffer.subarray(0, remaining));
    bytes += Math.min(buffer.length, remaining);
    if (buffer.length > remaining) {
      truncated = true;
      break;
    }
  }
  return { body: Buffer.concat(chunks).toString('utf8'), truncated };
}

/** Fetches public CSS or JavaScript through the checked transport used for HTML.
 * @param {string} url - Resolved asset address.
 * @param {BrowserAsset} kind - Expected upstream content type.
 * @param {AbortSignal} signal - Overall page deadline.
 * @returns {Promise<string>} Asset text, or empty text for an unavailable asset.
 */
async function loadAsset(url: string, kind: BrowserAsset, signal: AbortSignal): Promise<string> {
  try {
    const target = parseTargetUrl(url, { allowCustomHttpsPort: true });
    const source = await openSource(target, signal, 0, {}, { cookies: [], userAgent: '', deferRetries: true });
    try {
      if (ASSET_TYPE[kind].test(source.headers['content-type'] ?? '')) {
        const { body, truncated } = await readBody(source, PAGE_LIMIT.assetBytes);
        return truncated ? '' : body;
      }
    } finally {
      source.destroy();
    }
  } catch {
    // Missing assets leave the page available.
  }
  return '';
}

/** Reads a bounded page using the same public-address and redirect checks as direct downloads.
 * @param {URL} target - Validated initial page address.
 * @param {AbortSignal} signal - Page request deadline or client disconnect.
 * @returns {Promise<BrowserDocument>} Renderable document and links, or metadata for a direct file.
 */
async function browse(target: URL, signal: AbortSignal): Promise<BrowserDocument> {
  const source = await openSource(target, signal, 0, {}, { cookies: [], userAgent: '', deferRetries: true });
  const url = source.sourceUrl ?? target.href;
  try {
    const contentType = source.headers['content-type'] ?? '';
    const attachment = /^attachment\b/iu.test(source.headers['content-disposition'] ?? '');
    if (attachment || !/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/iu.test(contentType)) {
      return { url, title: 'File link', html: '', links: [], file: true, truncated: false };
    }
    const { body, truncated } = await readBody(source, PAGE_LIMIT.bytes);
    return await readBrowserPage(body, url, truncated, (href, kind) => loadAsset(href, kind, signal));
  } finally {
    source.destroy();
  }
}

/** Creates the authenticated station browser endpoint.
 * @returns {Router} Bounded page navigation route.
 */
export function createStationBrowserRoutes(): Router {
  const router = Router();
  const previews = new Map<string, { html: string; expires: number }>();
  let active = 0;
  router.get('/preview/:id', (request, response) => {
    response.setHeader('Content-Security-Policy', PREVIEW_CSP);
    const preview = previews.get(request.params.id);
    if (!preview || preview.expires <= Date.now()) {
      previews.delete(request.params.id);
      response.status(HTTP_STATUS.notFound).type('text/plain').send('Preview expired. Open the address again.');
      return;
    }
    response.type('html').send(preview.html);
  });
  router.post('/', async (request, response) => {
    if (active >= PAGE_LIMIT.concurrent) {
      response.status(HTTP_STATUS.tooManyRequests).json({ error: 'The browser is busy. Try again shortly.' });
      return;
    }
    let target: URL;
    try {
      target = parseTargetUrl(request.body?.url, { allowCustomHttpsPort: true });
    } catch {
      response.status(HTTP_STATUS.badRequest).json({ error: 'Enter a valid public HTTP or HTTPS address.' });
      return;
    }
    const controller = new AbortController();
    response.once('close', () => controller.abort());
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(PAGE_LIMIT.milliseconds)]);
    active += 1;
    try {
      const { html, ...page } = await browse(target, signal);
      let previewUrl = '';
      if (html) {
        const id = randomUUID();
        if (previews.size >= PREVIEW_CACHE.entries) {
          previews.delete(previews.keys().next().value!);
        }
        previews.set(id, { html, expires: Date.now() + PREVIEW_CACHE.lifetimeMilliseconds });
        previewUrl = `${STATION_BROWSER_PATH}/preview/${id}`;
      }
      response.json({ ...page, previewUrl });
    } catch {
      if (!response.destroyed) {
        response.status(HTTP_STATUS.badRequest).json({ error: 'The station could not open this public page.' });
      }
    } finally {
      active -= 1;
    }
  });
  return router;
}
