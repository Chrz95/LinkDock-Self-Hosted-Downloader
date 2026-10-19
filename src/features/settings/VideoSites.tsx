import { useState } from 'react';
import { VIDEO_SITES } from '../../../shared/videoSites';

/** Searchable extractor catalogue; availability depends on the source and installed engine.
 * @returns {JSX.Element} Recognized platform names and honest generic-extractor guidance.
 */
export function VideoSites() {
  const [query, setQuery] = useState('');
  const sites = VIDEO_SITES.filter((site) =>
    `${site.name} ${site.domains.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="video-site-catalog">
      <h3>Video &amp; audio sources</h3>
      <label>
        Search recognized video sites
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="YouTube, Streamable, Rumble…"
        />
      </label>
      <p className="policy-footnote">
        Auto detect recognizes these platforms. Choose Video for other sites supported by yt-dlp, including compatible
        embedded players and media links. MP3 is available for audio-only sources too.
      </p>
      <p className="policy-footnote">
        Pornhub, XVideos, XNXX, xHamster, YouPorn, RedTube and SpankBang use the same Video and MP3 options. Paste an
        individual video or supported embed link. For a source that requires a signed-in session, use Settings → Browser
        verification &amp; waits to import your site cookies.
      </p>
      <ul className="video-site-list">
        {sites.map((site) => (
          <li key={site.name}>{site.name}</li>
        ))}
      </ul>
      {!sites.length && <p className="policy-footnote">No recognized match. Try Video mode for other sites.</p>}
      <p className="policy-footnote">
        Instagram and DeviantArt use gallery-dl. Site support can change; keep tools updated. DRM, account access,
        regions, expiring links and browser-bound verification can prevent downloads. A listed site is not a live
        success check.
      </p>
    </section>
  );
}
