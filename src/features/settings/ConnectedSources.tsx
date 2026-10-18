/** Describes the deployment-level source options alongside station and utility preferences.
 * @returns {JSX.Element} Source support and cookie-mount guidance.
 */
export function ConnectedSources() {
  return (
    <details className="station-settings connected-sources">
      <summary>Connected sources</summary>
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
