import { defaultTreeAdapter as tree, html as markup, parse, serialize, type DefaultTreeAdapterTypes } from 'parse5';
import type { BrowserLink, BrowserPage } from '../../shared/stationBrowser.js';
import { parseTargetUrl } from '../security/target.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;
export type BrowserDocument = Omit<BrowserPage, 'previewUrl'> & { html: string };
export type BrowserAsset = 'stylesheet' | 'script';
const SKIP_CHILDREN = new Set(['script', 'style', 'noscript', 'template', 'svg', 'math', 'iframe', 'object']);
const TAGS = new Set(
  (
    'html head body title style script button main article aside section header footer nav address div span p br hr ' +
    'h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table caption colgroup col thead tbody tfoot tr th td ' +
    'a img figure figcaption picture blockquote details summary pre code kbd samp var ' +
    'em strong b i small big mark abbr time q cite dfn u s sub sup ruby rt rp bdi bdo wbr'
  ).split(' '),
);
const ATTRIBUTES = new Set([
  'id',
  'class',
  'style',
  'title',
  'role',
  'lang',
  'dir',
  'hidden',
  'alt',
  'width',
  'height',
  'colspan',
  'rowspan',
  'scope',
  'open',
  'start',
  'reversed',
  'media',
]);
export const PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts";
const BROWSER_LIMIT = { links: 100, label: 200, stylesheets: 4, scripts: 6 } as const;

/** Preserves inline scripts and replaces linked scripts with checked, embedded bytes.
 * @param {DefaultTreeAdapterTypes.Element} node - Script element from the parsed page.
 * @param {string} base - Resolved document base.
 * @param {(url: string, kind: BrowserAsset) => Promise<string>} loadAsset - Bounded public asset loader.
 * @param {Promise<void>[]} scripts - Pending script loads in document order.
 */
function prepareScript(
  node: DefaultTreeAdapterTypes.Element,
  base: string,
  loadAsset: ((url: string, kind: BrowserAsset) => Promise<string>) | undefined,
  scripts: Promise<void>[],
): void {
  const { attrs } = node;
  const src = attrs.find(({ name }) => name === 'src');
  node.attrs = attrs.filter(({ name }) => ['id', 'type', 'defer', 'async', 'nomodule'].includes(name));
  if (!src) {
    return;
  }
  const url = src.value.trim() && resolveLink(src.value, base);
  if (!url || !loadAsset || scripts.length >= BROWSER_LIMIT.scripts) {
    tree.detachNode(node);
    return;
  }
  scripts.push(
    loadAsset(url, 'script').then((code) => {
      if (!code) {
        tree.detachNode(node);
        return;
      }
      node.attrs.push({ name: 'src', value: `data:text/javascript;base64,${Buffer.from(code).toString('base64')}` });
    }),
  );
}

/** Walks parsed markup without evaluating scripts or recursively traversing upstream nesting.
 * @param {HtmlNode} root - Start of the document or link subtree.
 * @returns {Generator<HtmlNode>} Nodes in document order.
 */
function* walk(root: HtmlNode): Generator<HtmlNode> {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop()!;
    yield node;
    if ('childNodes' in node && !('tagName' in node && (!node.parentNode || SKIP_CHILDREN.has(node.tagName)))) {
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

/** Prepares sanitized markup and navigable links for the station browser.
 * @param {string} html - Bounded response body.
 * @param {string} url - Final response address.
 * @param {boolean} truncated - Whether the upstream body exceeded its size limit.
 * @param {(url: string, kind: BrowserAsset) => Promise<string>} [loadAsset] - Bounded public asset loader.
 * @returns {Promise<BrowserDocument>} Page metadata and a sandbox-ready document.
 */
export async function readBrowserPage(
  html: string,
  url: string,
  truncated: boolean,
  loadAsset?: (url: string, kind: BrowserAsset) => Promise<string>,
): Promise<BrowserDocument> {
  const document = parse(html);
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
  const stylesheets: Promise<void>[] = [];
  const scripts: Promise<void>[] = [];
  let title = '';
  for (const node of walk(document)) {
    if (!('tagName' in node)) {
      continue;
    }
    if (node.tagName === 'title' && !title) {
      const [first] = node.childNodes;
      title = first && 'value' in first ? first.value.trim().slice(0, BROWSER_LIMIT.label) : '';
    }
    const { attrs } = node;
    const href = attrs.find((attribute) => attribute.name === 'href')?.value.trim();
    const target = href && !href.startsWith('#') ? resolveLink(href, base) : undefined;
    if (node.namespaceURI !== markup.NS.HTML || !TAGS.has(node.tagName)) {
      const stylesheet =
        node.tagName === 'link' &&
        attrs.some(({ name, value }) => name === 'rel' && value.toLowerCase().split(/\s+/u).includes('stylesheet'));
      if (stylesheet && target && loadAsset && stylesheets.length < BROWSER_LIMIT.stylesheets && node.parentNode) {
        const style = tree.createElement(
          'style',
          markup.NS.HTML,
          attrs.filter(({ name }) => name === 'media'),
        );
        tree.insertBefore(node.parentNode, style, node);
        stylesheets.push(
          loadAsset(target, 'stylesheet').then((css) => {
            tree.insertText(style, css.replace(/<(?=\/style)/giu, '\\3c '));
          }),
        );
      }
      tree.detachNode(node);
      continue;
    }
    if (node.tagName === 'script') {
      prepareScript(node, base, loadAsset, scripts);
      continue;
    }
    node.attrs = attrs.filter(
      ({ name, namespace }) => !namespace && (ATTRIBUTES.has(name) || name.startsWith('data-')),
    );
    if (node.tagName !== 'a' || !target || target === url) {
      continue;
    }
    const download = attrs.some((attribute) => attribute.name === 'download');
    let entry = links.get(target);
    if (!entry && links.size === BROWSER_LIMIT.links) {
      truncated = true;
      continue;
    }
    if (!entry) {
      const label = [...walk(node)]
        .flatMap((child) => ('value' in child ? [child.value] : []))
        .join(' ')
        .trim();
      entry = { url: target, label: label.slice(0, BROWSER_LIMIT.label) || target, download };
      links.set(target, entry);
    }
    entry.download ||= download;
  }
  await Promise.all([...stylesheets, ...scripts]);
  return {
    url,
    title: title || new URL(url).hostname,
    html: serialize(document),
    links: [...links.values()],
    file: false,
    truncated,
  };
}
