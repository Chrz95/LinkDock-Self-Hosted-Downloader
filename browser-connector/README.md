# LinkDock Browser Companion 1.2

For desktop Chrome, Edge or Brave (Chromium 102+), with **LinkDock 2.31 or newer** for independent download access. Pair
once from a signed-in station tab, then add downloads even with that tab closed. The station must still be running and
reachable. No station password is stored in the extension.

## Install or update

Unzip the companion, open the browser's Extensions page, enable **Developer mode**, choose **Load unpacked** and select
the folder containing `manifest.json`. To update, replace the files in the existing unpacked folder and press
**Reload**. Download the package from **Settings → Browser companions**, or use the standalone companion ZIP.

Existing 1.1 connections keep their tab-based download flow until you click **Connect station** again. Independent
access requires rebuilding the station with LinkDock 2.31+. Installing the extension alone does not upgrade the station.

## Pair your station

1. Open your trusted LinkDock station and sign in.
2. Open the companion, enter the exact station address and port, and click **Connect station**.
3. Allow access to that station host. Pairing uses the open tab's existing station session.
4. Once pairing is confirmed, close the station tab if you wish.

A random download-only token is stored in local extension storage, restricted to trusted extension contexts. The station
stores only its hash and revocation metadata. No station password, source cookies, submitted-link history or download
queue is stored by the extension. Pairing must be repeated if it expires or is revoked. Normal and incognito
destinations are kept separately; browser local storage itself is shared between modes, rather than being an incognito
vault.

Host permissions can include other ports on a hostname; operations always use the exact paired origin and port. Token
requests omit browser cookies, reject redirects and have a timeout. A token can only add downloads or revoke itself; it
cannot list files, read the library, change settings or import site sessions. Use **HTTPS**: HTTP transmits pairing
credentials and download links unencrypted over the network.

## Add a download

1. Browse to a file, video or gallery and open the companion. The current page link is suggested without fetching it.
2. Edit the link or paste an HTTP, HTTPS, torrent URL or magnet link.
3. Optionally choose a source, video quality or MP3 audio under **Download options**.
4. Click **Add to LinkDock** and wait for confirmation. This confirms queue acceptance, not download completion.

Downloads do not read source cookies or request source-site permissions. **Open library** shows progress on the station.
The companion never automatically retries an uncertain submission: check the library before sending again. A revoked or
expired connection produces reconnection instructions. A closed station tab does not affect a paired download request.

## Revoke or forget access

**Settings → Browser companions** lists creation and expiry times and lets you revoke individual connections
immediately. Connections expire after 90 days. Changing the station password invalidates all existing connections;
signing out of the station browser alone does not revoke them.

**Forget** attempts to revoke the current connection and removes it locally. If the station is offline or permission is
missing, the companion explains that you must revoke it in station Settings. Re-pairing attempts to revoke the previous
connection for that browser mode; any unsuccessful cleanup is reported. Browser host permissions can be removed in the
browser's extension settings. Losing an unpacked extension's identity may require a new pairing and manual revocation of
the old connection.

## Optional site-session sharing

For this action, open your station and sign in. Sign in to Instagram or DeviantArt in the same browser profile, open
**Connect a site session**, choose the site, verify the destination, check the trust box and click **Send session to
LinkDock**. Grant access only to the selected source. Retry the original download from the station.

Only the selected site's cookies are read after that explicit click. Other saved site sessions remain intact. The
station tab's cookie store is used, with normal/incognito separation. Partitioned cookies are excluded because Netscape
jars cannot preserve their boundaries. Site sessions are sent through the station's ordinary authenticated API, never
through the download-only token. HTTPS also protects these transfers. DeviantArt OAuth remains separate.

No background scripts, broad required host permissions, browsing-history access, telemetry or external services are
added. The companion does not solve CAPTCHAs, and browser/IP-bound challenges may still fail on the Pi.
