import { VideoSites } from './VideoSites';
/** Describes the deployment-level source options alongside station and utility preferences.
 * @returns {JSX.Element} Source support and cookie-mount guidance.
 */
export function ConnectedSources() {
  return (
    <details className="station-settings connected-sources">
      <summary>Connected sources</summary>
      <VideoSites />
      <p className="policy-footnote">
        DeviantArt saves artwork/photos, available videos and stories/journals as text. Paste an artwork, gallery,
        gallery-folder, journals or artist-profile link. Profiles use your saved DeviantArt collection choices. Entire
        galleries are paginated within your size/file limits. Gallery quality and story format use DeviantArt settings,
        independently of video/MP3 selectors. Add an optional OAuth refresh token under DeviantArt collections &
        account; inaccessible or locked works cannot be unlocked by LinkDock.
      </p>
      <p className="policy-footnote">Video mode supports sites handled by yt-dlp. Instagram saves photos and reels.</p>
      <p className="policy-footnote">
        Some sources need a signed-in cookie file. Follow the read-only cookie mount setup in the deployment guide.
      </p>
      <p className="policy-footnote">
        Torrents need reachable peers. Uploading can occur while downloading; seeding stops on completion.
      </p>
    </details>
  );
}
