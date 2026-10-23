import { VideoSites } from './VideoSites';
/** Describes the deployment-level source options alongside station and utility preferences.
 * @returns {JSX.Element} Source support and cookie-mount guidance.
 */
export function ConnectedSources() {
  return (
    <details className="station-settings connected-sources">
      <summary>Supported sites</summary>
      <VideoSites />
      <p className="policy-footnote">
        Video mode uses yt-dlp. Instagram supports photos and reels; DeviantArt supports artwork, galleries and writing.
        Manage account access above. Support depends on the site and your access to the item.
      </p>
      <p className="policy-footnote">Torrents need peers; uploading stops when the download completes.</p>
    </details>
  );
}
