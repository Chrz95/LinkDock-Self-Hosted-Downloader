# LinkDock Browser Companion

Requires LinkDock 2.23+ and desktop Chrome, Edge or Brave. Install once using Extensions → Developer mode → Load
unpacked → this folder. Pin its toolbar icon.

1. Sign in to Instagram or DeviantArt in the same browser profile. Complete any site verification normally; this
   companion does not solve CAPTCHAs.
2. Open your LinkDock station and sign in. Keep that tab active.
3. Open the companion, select the source, verify the destination address, check the trust box and click **Send session
   to LinkDock**. Grant access to that site.
4. Retry the download. Reopen LinkDock's settings panel to refresh saved sessions.

No cookie export/import or station access token is needed. Only the selected site is read on an explicit click. No
background synchronization, external services, telemetry, or extension storage. You must send again after the session
expires. Cookies grant account access. Use only a trusted station; prefer HTTPS. HTTP sends credentials unencrypted
across your LAN. No credentials are placed in URLs.

Uses the active tab's cookie store. Partitioned cookies are excluded because a Netscape jar cannot preserve their
partition boundaries. Ordinary HttpOnly session cookies are supported. Browser/IP-bound challenges can still fail on the
Pi. DeviantArt OAuth remains separate and is neither changed nor removed by this flow. Mobile browsers without extension
support can use sessions sent from a desktop browser. This is an unpacked companion, not a published browser-store
extension.
