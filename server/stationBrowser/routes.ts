import { Router } from 'express';
import { HTTP_STATUS } from '../../shared/contracts.js';
import type { BrowserPage } from '../../shared/stationBrowser.js';
import { openSource } from '../downloads/openSource.js';
import { parseTargetUrl } from '../security/target.js';
import { readBrowserPage } from './page.js';

const PAGE_LIMIT = { bytes: 524_288, milliseconds: 12_000, concurrent: 2 } as const;

/** Reads a bounded page using the same public-address and redirect checks as direct downloads.
 * @param {URL} target - Validated initial page address.
 * @param {AbortSignal} signal - Page request deadline or client disconnect.
 * @returns {Promise<BrowserPage>} Text and links, or metadata for a direct file.
 */
async function browse(target: URL, signal: AbortSignal): Promise<BrowserPage> {
  const source = await openSource(target, signal, 0, {}, { cookies: [], userAgent: '', deferRetries: true });
  const url = source.sourceUrl ?? target.href;
  try {
    const contentType = source.headers['content-type'] ?? '';
    const attachment = /^attachment\b/iu.test(source.headers['content-disposition'] ?? '');
    if (attachment || !/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/iu.test(contentType)) {
      return { url, title: 'File link', text: '', links: [], file: true, truncated: false };
    }
    if (source.headers['content-encoding'] && source.headers['content-encoding'] !== 'identity') {
      throw new Error('Unsupported page encoding.');
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    let truncated = false;
    for await (const chunk of source) {
      const buffer = Buffer.from(chunk);
      const remaining = PAGE_LIMIT.bytes - bytes;
      chunks.push(buffer.subarray(0, remaining));
      bytes += Math.min(buffer.length, remaining);
      if (buffer.length > remaining) {
        truncated = true;
        break;
      }
    }
    return readBrowserPage(Buffer.concat(chunks).toString('utf8'), url, truncated);
  } finally {
    source.destroy();
  }
}

/** Creates the authenticated station browser endpoint.
 * @returns {Router} Bounded page navigation route.
 */
export function createStationBrowserRoutes(): Router {
  const router = Router();
  let active = 0;
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
      response.json(await browse(target, signal));
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
