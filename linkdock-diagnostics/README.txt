LinkDock diagnostic launchers

These four self-contained shell scripts include their JavaScript/Python diagnostic code.
You do not need the previous .mjs downloads, Node or Python on the Pi host; those run in the container.
Docker must be installed and the LinkDock container must already be running.

Extract this ZIP and open a terminal in the linkdock-diagnostics folder.

Run one diagnostic:
  sh linkdock-diagnostic-page.sh
  sh linkdock-diagnostic-api.sh
  sh linkdock-diagnostic-connection.sh

Run all three in sequence:
  sh linkdock-diagnostic-all.sh

The connection diagnostic is the most useful for the DNS issue already identified.
Running all repeats the source requests performed by the individual diagnostics.
The scripts automatically use sudo if your user cannot access Docker; you may be prompted for your Pi password.

Default container: link_dock. To choose another:
  sh linkdock-diagnostic-connection.sh another_container

The scripts work from any directory. They do not rebuild, restart or change the container.
Use LinkDock 2.25 or newer. On 2.26+, the proxy follows the container's MEDIA_DNS_MODE setting.
They report configured_media_dns_mode; the connection diagnostic's station_proxy.dns section describes OS DNS,
which can still show non-public addresses even when Cloudflare media DNS is enabled.

Page diagnostic: LD-DA-PAGE-1. Compares the original and ID-only item URLs.
API diagnostic: LD-DA-API-2. Also reads an existing access token from the private cache for read-only API GETs.
Connection diagnostic: LD-DA-CONNECTION-3. Adds DNS/proxy details, a direct connectivity check without cookies,
and compatibility checks for private access-token cache formats.

These probes target the DeviantArt link used in this conversation. They do not fetch a new OAuth token, export
credentials or download media. If a cached token is missing or expired, the API check is skipped.
Results appear in the terminal. To save one result:
  sh linkdock-diagnostic-connection.sh > connection-result.json
To save all results (separate JSON reports in one text file):
  sh linkdock-diagnostic-all.sh > diagnostic-results.txt
