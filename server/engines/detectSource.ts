import { SOURCE_TYPE, SOURCE_URL, VIDEO_QUALITY, type DownloadRequest, type SourceType } from '../../shared/sources.js';
import { parseTargetUrl } from '../security/target.js';
import { getSafeFilename } from '../downloads/filename.js';
import { LIMIT } from '../constants.js';

/** Recognized platforms automatically routed to a site extractor; Video mode covers other supported sites. */
const VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'tiktok.com',
  'dailymotion.com',
  'twitch.tv',
  'facebook.com',
  'fb.watch',
  'twitter.com',
  'x.com',
  'reddit.com',
  'bilibili.com',
];
/** Magnet IDs supported by aria2's BitTorrent v1 engine. */
const INFO_HASH_PATTERN = /^(?:[a-f\d]{40}|[a-z2-7]{32})$/i;

/**
 * Matches an exact platform domain or its subdomains without substring lookalikes.
 * @param {string} hostname - Normalized URL hostname.
 * @param {string} domain - Trusted platform domain.
 * @returns {boolean} Whether the host belongs to the platform.
 */
function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * Validates input and resolves its engine without interpreting user text as subprocess options.
 * @param {unknown} sourceUrl - Submitted link.
 * @param {unknown} requestedType - Optional source selector.
 * @param {unknown} quality - Optional video resolution policy.
 * @returns {DownloadRequest & {sourceType: SourceType; filename: string}} Resolved download request.
 */
export function resolveDownloadRequest(sourceUrl: unknown, requestedType: unknown, quality: unknown) {
  if (typeof sourceUrl !== 'string' || sourceUrl.length > LIMIT.maximumUrlLength) {
    throw new Error('Paste a file, video, Instagram, torrent or magnet link.');
  }
  const sourceType = requestedType ?? SOURCE_TYPE.auto;
  if (
    !Object.values(SOURCE_TYPE).some((value) => value === sourceType) ||
    (quality !== undefined && !Object.values(VIDEO_QUALITY).some((value) => value === quality))
  ) {
    throw new Error('Choose a supported source and quality.');
  }
  const target = new URL(sourceUrl.trim());
  if (target.protocol === SOURCE_URL.magnetProtocol) {
    if (sourceType !== SOURCE_TYPE.auto && sourceType !== SOURCE_TYPE.magnet && sourceType !== SOURCE_TYPE.torrent) {
      throw new Error('Choose Magnet or Auto detect for a magnet link.');
    }
    const exactTopic = target.searchParams.get('xt') ?? '';
    if (
      !exactTopic.startsWith(SOURCE_URL.infoHashTopic) ||
      !INFO_HASH_PATTERN.test(exactTopic.slice(SOURCE_URL.infoHashTopic.length))
    ) {
      throw new Error('Use a BitTorrent v1 magnet link containing a valid info hash.');
    }
    return {
      url: target.href,
      sourceType: SOURCE_TYPE.magnet,
      quality: VIDEO_QUALITY.balanced,
      filename: (target.searchParams.get('dn') || 'Magnet download').slice(0, LIMIT.maximumFilenameLength),
    };
  }
  const validatedTarget = parseTargetUrl(target.href);
  const { hostname } = validatedTarget;
  const isInstagram = matchesDomain(hostname, 'instagram.com');
  if (sourceType === SOURCE_TYPE.instagram && !isInstagram) {
    throw new Error('Instagram mode requires an instagram.com post or reel link.');
  }
  if (isInstagram && !/^\/(?:p|reel|reels|tv)\/[^/]+/.test(validatedTarget.pathname)) {
    throw new Error('Paste an individual Instagram post, carousel or reel link.');
  }
  if (sourceType === SOURCE_TYPE.magnet) {
    throw new Error('Paste a magnet link for Magnet mode.');
  }
  let resolvedType = sourceType as SourceType;
  if (sourceType === SOURCE_TYPE.auto) {
    resolvedType = isInstagram
      ? SOURCE_TYPE.instagram
      : validatedTarget.pathname.toLowerCase().endsWith('.torrent')
        ? SOURCE_TYPE.torrent
        : VIDEO_HOSTS.some((domain) => matchesDomain(hostname, domain))
          ? SOURCE_TYPE.video
          : SOURCE_TYPE.direct;
  }
  return {
    url: validatedTarget.href,
    sourceType: resolvedType,
    quality: quality ?? VIDEO_QUALITY.balanced,
    filename: getSafeFilename(validatedTarget),
  } as DownloadRequest & { sourceType: SourceType; filename: string };
}
