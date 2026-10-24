# LinkDock Browser Companion 1.1

For desktop Chrome, Edge or Brave, with LinkDock **2.23 or newer**. The download feature works with your existing
station; no backend upgrade or station password in the extension is required.

## Install or update

Unzip the companion, open the browser's Extensions page, enable **Developer mode**, choose **Load unpacked** and select
this folder (the folder containing `manifest.json`). Pin the new green/lime download icon to the toolbar.

To update an existing unpacked installation, replace the files in its existing folder and press **Reload** on its card
in Extensions. The application also serves the latest package at `/linkdock-browser-connector.zip` after rebuilding.
This is an unpacked extension, not a browser-store listing; it cannot install itself without browser approval.

## Connect your station once

1. Open your trusted LinkDock station and sign in. Keep that tab open.
2. Open the companion. Enter the station address, including the port, for example `http://raspberrypi:7489`.
3. Click **Connect station** and allow access to that station host. The companion checks the station identity in its
   existing signed-in tab before remembering it. If no station tab is open, it opens one; sign in and connect again.

Only the station origin, preferred tab ID and normal/incognito mode are remembered in local extension storage. No
station password, source cookies, submitted URL history or download queue is stored there. Host permission patterns can
cover other ports on the chosen host; every station operation additionally checks the exact origin and port.

## Add a download from any tab

1. Browse to the video, gallery or file you want. Open the companion: the current page link is filled in automatically.
2. Edit that link if needed, or paste any supported HTTP, HTTPS, torrent URL or magnet link.
3. Optionally expand **Download options** to select a source, video quality or MP3 audio. Quality applies to the video
   engine; other sources use their normal LinkDock settings. Auto detection uses the same rules as your station.
4. Click **Add to LinkDock**. A confirmation means the download has been added to your Pi's queue, not that it has
   finished. **Open library** shows its progress. The popup can be closed after confirmation.

Keep a signed-in station tab open in the same browser mode. It can be in the background. If you close it, use **Open
library**, sign in if needed, then send again. The station is found again even if its tab ID changes. If a response is
lost, check your library before retrying; the companion does not automatically retry potentially accepted submissions.

Adding a download does not read source cookies or ask for permission to the source site. It uses your station tab's
existing HttpOnly owner session and same-origin API protections. Sources with browser checks may still need a session or
additional access configured in LinkDock. Download links can contain private query parameters: only send them to a
station you trust. HTTP station connections transmit submitted links and session transfers unencrypted across the LAN.

## Optional site-session sharing

1. Sign in to Instagram or DeviantArt in this browser profile and complete any site verification normally.
2. Open the companion and expand **Connect a site session**.
3. Select the source, verify the displayed station, check the trust box and click **Send session to LinkDock**.
4. Grant access only to the selected source, then retry the failed download in LinkDock. Reopen Settings → Browser
   sessions to refresh the saved-session list.

Only the chosen source's cookies are read, only after that explicit click. Other sources' saved sessions are retained.
No cookie export file or access-token entry is needed. Send again when a session expires. Ordinary HttpOnly cookies are
supported; partitioned cookies are excluded because Netscape jars cannot preserve their partition boundaries. The
station tab's cookie store is used and normal/incognito contexts are not mixed.

The extension declares optional HTTP/HTTPS host patterns to support self-hosted station addresses, but grants are
requested only for the station you choose and, separately, Instagram or DeviantArt when sending a session. It has no
background scripts, browsing-history permission, background synchronization, telemetry or external service requests. It
does not solve CAPTCHAs. Browser/IP-bound challenges may still fail on the Pi. DeviantArt OAuth remains separate. Mobile
browsers without extension support can continue to use sessions sent from a desktop browser.

**Forget** removes the remembered station. Manage any previously granted site permissions in the browser's extension
settings. Reconnecting or changing a station requires checking the session-sharing trust box again.
