import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import type { BrowserLink, BrowserPage } from '../../shared/stationBrowser.js';
import { parseTargetUrl } from '../security/target.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
const IGNORED = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe']);
const BROWSER_LIMIT = { links: 100, text: 10_000, label: 200 } as const;

/** Walks parsed markup without evaluating scripts or recursively traversing upstream nesting.
 * @param {HtmlNode} root - Start of the document or link subtree.
 * @returns {Generator<HtmlNode>} Nodes in document order.
 */
function* walk(root: HtmlNode): Generator<HtmlNode> {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop()!;
    if ('tagName' in node && IGNORED.has(node.tagName)) {
      continue;
    }
    yield node;
    if ('childNodes' in node) {
      for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
        pending.push(node.childNodes[index]!);
      }
    }
  }
}

/** Resolves only supported web addresses, retaining signed query strings.
 * @param {string} input - Source attribute or URL.
 * @param {string} base - Final page address or declared base.
 * @returns {string | undefined} Validated address.
 */
function resolveLink(input: string, base: string): string | undefined {
  try {
    return parseTargetUrl(new URL(input, base).href, { allowCustomHttpsPort: true }).href;
  } catch {
    return undefined;
  }
}

/** Extracts inert page text and navigable links for the station browser.
 * @param {string} html - Bounded response body.
 * @param {string} url - Final response address.
 * @param {boolean} truncated - Whether the upstream body exceeded its size limit.
 * @returns {BrowserPage} Structured data safe to render as text.
 */
export function readBrowserPage(html: string, url: string, truncated: boolean): BrowserPage {
  const document = parse(html, { scriptingEnabled: false });
  let base = url;
  for (const node of walk(document)) {
    if ('tagName' in node && node.tagName === 'base') {
      const href = node.attrs.find((attribute) => attribute.name === 'href');
      if (href) {
        base = resolveLink(href.value, url) ?? url;
        break;
      }
    }
  }
  const links = new Map<string, BrowserLink>();
  let title = '';
  let text = '';
  for (const node of walk(document)) {
    if ('value' in node && !('tagName' in node) && node.nodeName === '#text' && text.length < BROWSER_LIMIT.text) {
      if (node.parentNode && !('tagName' in node.parentNode && node.parentNode.tagName === 'title')) {
        text += ` ${node.value.slice(0, BROWSER_LIMIT.text - text.length)}`;
      }
    }
    if (!('tagName' in node)) {
      continue;
    }
    if (node.tagName === 'title' && !title) {
      const [first] = node.childNodes;
      title = first && 'value' in first ? first.value.trim().slice(0, BROWSER_LIMIT.label) : '';
    }
    if (node.tagName !== 'a') {
      continue;
    }
    const href = node.attrs.find((attribute) => attribute.name === 'href')?.value.trim();
    const target = href && !href.startsWith('#') ? resolveLink(href, base) : undefined;
    if (!target || target === url) {
      continue;
    }
    const download = node.attrs.some((attribute) => attribute.name === 'download');
    const previous = links.get(target);
    if (previous) {
      previous.download ||= download;
      continue;
    }
    if (links.size === BROWSER_LIMIT.links) {
      truncated = true;
      continue;
    }
    const label = node.childNodes
      .flatMap((child) => [...walk(child)].flatMap((entry) => ('value' in entry ? [entry.value] : [])))
      .join(' ')
      .trim()
      .slice(0, BROWSER_LIMIT.label);
    links.set(target, { url: target, label: label || target, download });
  }
  return {
    url,
    title: title || new URL(url).hostname,
    text: text.replace(/\s+/gu, ' ').trim(),
    links: [...links.values()],
    file: false,
    truncated: truncated || text.length >= BROWSER_LIMIT.text,
  };
}
