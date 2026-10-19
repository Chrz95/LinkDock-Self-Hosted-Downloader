# Run LinkDock 2.18 on your Raspberry Pi

1. Use 64-bit Raspberry Pi OS and install Docker Engine with the Compose plugin.
2. Extract this project and open a terminal in its `linkdock` directory.
3. Configure a private station password:

   ```bash
   cp .env.example .env
   openssl rand -hex 32
   nano .env
   ```

   Paste the generated value after `LINKDOCK_ACCESS_TOKEN=` and save the file.

4. Start the station:

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

5. Visit `http://YOUR_PI_IP:8080` and enter that password. Paste a direct HTTP/HTTPS file link.

Downloads continue when you close the tab. Files and history survive ordinary container restarts. Use the save icon to
copy a completed file to your current device. Delete requires confirmation and removes both the stored file and its
record.

On a phone or tablet, open the same station address while connected to that network. Phone navigation links lead to
Overview, Library and Settings. The layout uses larger touch controls, a full-width composer/search and stacked file
actions. The website needs no installation. HTTPS enables optional installation, supported share menus and browser
alerts.

For USB storage, backups, HTTPS, configuration, development and troubleshooting, see `README.md`. For checks and
requirement adjustments, see `VALIDATION.md`.

## New in version 2

- Choose Video for YouTube and other supported sites; choose a source-quality ceiling from 360p to 2160p/4K, or best
  available.
- Paste an Instagram post/reel link for photos, videos and carousel items.
- Paste a torrent URL or magnet, or use **Upload .torrent** for a local metadata file.
- Expand **View files** on completed multi-file jobs to save individual items to your current device.
- Use the sun/moon button for the saved dark/light appearance.

Some media sources need a login cookie file. Follow the optional `compose.cookies.yaml` setup in `README.md`. No social
account password is entered into LinkDock. Torrents need available peers; uploads may occur during the transfer and
seeding stops when complete.

If upgrading from the previous version, retain `.env` and the existing volume, replace the source and run
`docker compose up -d --build`. Old direct downloads remain available.

## New in version 2.2

- Pause keeps partial data; Resume requeues it. Restart and Cancel discard partial progress.
- Active jobs requeue after a service restart; manually paused jobs stay paused.
- Open **Station controls** for download/upload limits, a daily window and a free-space buffer.
- The initial buffer is **1 GiB**. If the queue is waiting for space, free space or reduce this value.
- The default schedule timezone is **Europe/Athens**; change it if you want a different timezone.

Direct file continuation requires a stable strong ETag and a valid range response from the same final URL. Unsupported
sources restart from zero. External media/torrent engines reuse progress where supported. See `README.md` for limits,
queue-slot rate allocation and restart behavior. Retain the complete data volume, including `settings.json`, on
upgrades.

## New in version 2.3

- Paste up to **50 links**, one per line; Review shows duplicate skips, then Queue accepts all valid new records
  together.
- Choose High, Normal or Low on waiting/paused jobs. Active work keeps running; equal priorities use oldest-first order.
- Open **On this device** for installation guidance and optional completion/failure alerts.
- Supported installed-app share targets open links for your review; they never download automatically.

For installation and alerts, configure an HTTPS reverse proxy and set `SECURE_COOKIE=true` plus the exact HTTPS
`PUBLIC_ORIGIN` in `.env`. To enable station alerts also set `WEB_PUSH_SUBJECT=mailto:you@example.com` with your real
contact, then run `docker compose up -d`. On each device, unlock the HTTPS site, enable alerts and use the test button.
Browser/OS support varies; ordinary link pasting still works. The offline page only explains how to reconnect.

Push alerts contain generic text, are best effort and can be coalesced or missed. Locking the dashboard does not revoke
previous push registrations. Disable alerts per device or follow the all-device revocation instructions in `README.md`.
Preserve `/data/notifications` with the rest of the data volume during upgrades and backups. Live provider delivery and
physical Pi/mobile-browser acceptance remain deployment checks.

## New in version 2.4

- Expand **Organize download** to save one logical folder and up to eight comma-separated tags on any job.
- Filter by folder, tag and transfer state together; search finds filenames and labels. **Clear filters** resets the
  view.
- Labels persist in `history.json` without moving or renaming stored files. **Reset labels** discards the current draft.
- Open **Station health** to inspect runtime, process memory/uptime, storage, queue holds and local engine versions.
- Health checks are private and lazy, with one-minute engine caching and bounded local commands. **Available** confirms
  the version command; verify a real source download separately. Restricted measurements show **Unavailable**.

No new environment variables or dependencies are needed. Retain the full data volume and `.env` during upgrades and run
`docker compose up -d --build`, then reload the browser. See `README.md` for label limits, filtering and health
semantics.

## New in version 2.5

- Completed compatible images and videos have an explicit preview button. Video starts muted with native controls.
- Expand **View files** for per-item previews and **Save all as ZIP** on multi-file jobs.
- A ZIP streams directly to the browser; no extra archive copy is stored on the Pi. Two exports may run at once.
- Finish or cancel a ZIP in your browser before deleting that job. Interrupted ZIP exports must be started again.
- Unsupported formats, large images and browser codec failures retain ordinary save controls.

No new deployment variables are needed. Keep `.env` and the full data volume, rebuild with
`docker compose up -d --build` and reload your browser. Real-device playback, seeking and large-archive acceptance
remain deployment checks.

## New in version 2.6

- Select individual jobs or **Select visible · up to 50** after filtering the library.
- **Organize selected** can change folders and add, remove or replace tags together. Unchanged fields retain each job's
  own labels; an empty replacement explicitly clears tags. Label changes commit together or keep all old values.
- **Review deletion** shows exact filenames before permanent removal of completed, failed or cancelled jobs.
- Active/paused jobs and jobs with an active ZIP export block bulk deletion. Filters clear selection; polling never
  selects new arrivals. Rows leaving the filtered view are deselected and invalidate deletion review.
- Failed deletions stay selected for review and retry. Some bytes may already have been removed after an I/O failure;
  deletion cannot be undone or rolled back. Refresh after a network failure before reviewing another attempt.

No new dependencies, environment variables or data-format fields are required. Keep `.env` and the full data volume, run
`docker compose up -d --build`, then reload your browser. Mobile layout and device acceptance remain deployment checks;
automated DOM tests cover selection, review and errors.

## New in version 2.7

- Optional completion/failure alerts now persist in a bounded private outbox and resume after a container restart.
- Temporary failures retry up to six total attempts with bounded backoff; pending records expire after one hour.
- Bursts coalesce per device/category. New devices and rotated browser keys do not receive old queued alerts.
- Open **Settings → On this device → Alert delivery · all registered devices** for private aggregate counts, refresh and
  an explicit **Clear pending alerts** action. Clearing does not disable registrations or recall requests already
  sending.
- Explicit test alerts remain immediate and do not retry automatically. Alerts are best effort: duplicates or missed
  events remain possible around crashes or storage failures, and provider acceptance does not prove device display.

Keep `.env` and the full data volume, including `/data/notifications`, then run `docker compose up -d --build` and
reload this page. No new dependencies or configuration variables are required. Malformed/unwritable backlog state
suspends background alerts while downloads continue; check station storage and follow the recovery steps in `README.md`.
Real-provider delivery and physical Pi/mobile acceptance remain deployment checks.

## New in version 2.8

- Open **Settings → Station health → System view** for OS-visible CPU threads, 1/5/15-minute load, uptime and total/free
  memory.
- Recognized CPU sensors expose temperature in Celsius. Missing or restricted values show **Unavailable**.
- System counters are separate from LinkDock's process data and Docker resource limits; load is not a CPU percentage.
- System readings cache for five seconds; a bounded single thermal probe prevents accumulating stalled reads.

If Docker hides the Pi CPU sensor, first verify `/sys/class/thermal/thermal_zone0/type` and its readable `temp` file,
then use the optional read-only override:

```bash
docker compose -f compose.yaml -f compose.metrics.yaml config
docker compose -f compose.yaml -f compose.metrics.yaml up -d --build
```

The source directory must already exist. Keep using the same override flags on subsequent commands, including
`-f compose.cookies.yaml` if applicable. See `README.md` for supported sensor types, other zone indices and scope.
Otherwise retain the normal Compose command and accept unavailable temperature. Keep `.env` and the full data volume; no
new configuration variables, dependencies or saved-history fields are required. Real Pi/mobile testing is pending.

## New in version 2.9

- New torrent/magnet jobs fetch metadata and pause. Open **Choose torrent files**, check the files you need and press
  **Download selected files**. Your selection survives restarts; neighboring BitTorrent piece bytes may be received.
- Use **Move on completion** to choose a relative physical folder such as `Movies` or `Media/Travel`. The default is
  `/data/completed/<folder>/<job-uuid>/files/`; saved files remain available in the browser. You can also move existing
  completed downloads. **Delete file & record** deletes that job's moved files as well.
- If a move fails, internal originals remain available. Fix the destination and choose **Retry move**. Once payload
  preparation begins, keep that destination for recovery. Back up completion storage along with the data volume.

Run terminal commands from this project directory with the container running:

```bash
docker compose exec linkdock node dist-server/server/cli.js list
docker compose exec linkdock node dist-server/server/cli.js pause all
docker compose exec linkdock node dist-server/server/cli.js resume all
docker compose exec linkdock node dist-server/server/cli.js pause JOB_UUID
docker compose exec linkdock node dist-server/server/cli.js resume JOB_UUID --at '2026-10-20T07:00:00+03:00'
docker compose exec linkdock node dist-server/server/cli.js schedules
docker compose exec linkdock node dist-server/server/cli.js unschedule SCHEDULE_UUID
```

Replace example IDs and dates. Timed commands need seconds and `Z` or an explicit UTC offset. `pause all` holds new jobs
across restarts; `resume all` clears that gate. Overdue schedules run when the station starts. Recurring station windows
and disk holds still apply, and unreviewed torrents stay paused. Use `--help` for file selection and destination
commands.

For separate USB/SSD completion storage, create a host folder writable by container UID/GID 1000 and set
`COMPLETED_HOST_DIRECTORY=/mnt/storage/linkdock-completed` in `.env`. Then use:

```bash
docker compose -f compose.yaml -f compose.destinations.yaml config
docker compose -f compose.yaml -f compose.destinations.yaml up -d --build
```

Keep existing cookie/temperature overrides if used. Keep the same completion mount on upgrades; the override refuses a
missing host source. See `README.md` for move recovery, storage layout, API details and scheduling semantics. Docker,
physical Pi, live swarm and rendered mobile acceptance remain unverified in this environment.

## New in version 2.10

- Choose **Video** or **Auto detect**, then select **Output format → Video** and your desired video quality.
- Select **MP3 audio** to extract audio at a target 128, 192 or 320 kbps. The result is an MP3 file, not a renamed
  video. Conversion uses ffmpeg, already included in the image. Higher bitrates cannot restore missing source detail.
- Open **Settings → Download utilities → Download utility updates** for automatic daily checks, update now,
  cancellation, previous-version rollback and restore. Updates wait for idle workers and hold new transfers until
  verification/activation finishes. Failed candidates leave the current tools selected. The Docker default enables
  automatic updates after a startup grace period; saved browser preferences persist. Keep at least 1 GiB free in
  writable/executable app storage.
- yt-dlp/gallery-dl use PyPI; aria2 uses compatible packages from the image's signed Debian repositories. aria2 can lag
  upstream releases. ffmpeg/base-library/app updates require an image rebuild. No root user or Docker socket is needed.

For your existing `link_dock` service/image workflow, rebuild the new source on the Pi, then recreate your service:

```bash
docker build -t localhost:5000/link_dock:latest .
docker compose up -d --force-recreate --pull never link_dock
```

Retain `.env`, app state and both download directories. Reload the browser afterward. New MP3/quality values require
this server version; use a matching pre-upgrade backup for a downgrade. Utility state lives under `/data/utilities`.

A complete bind-mount example is included as `compose.rpi.yaml`. To use it, set the existing password plus:

```dotenv
PORT=7489
LINKDOCK_DOWNLOAD_PATH=/home/pi/downloads/linkDock
AUTO_UPDATE_TOOLS=true
```

Create host directories with the correct ownership before launching:

```bash
sudo install -d -o 1000 -g 1000 -m 0750 \
  /home/pi/configs/linkDock \
  /home/pi/downloads/linkDock/transfers \
  /home/pi/downloads/linkDock/completed
docker compose -f compose.rpi.yaml config --quiet
docker compose -f compose.rpi.yaml up -d --build
```

The example keeps all data on the Pi: app state in `/home/pi/configs/linkDock`, transfers under the chosen download root
and optional completion destinations under its `completed` folder. Existing root-owned app files may still need
`sudo chown -R 1000:1000 /home/pi/configs/linkDock` and `sudo chmod -R u+rwX /home/pi/configs/linkDock`, as with the
history-file error. Run setup on the Docker host and preserve existing data when changing mounts.

Terminal controls for the supplied Pi example:

```bash
docker compose -f compose.rpi.yaml exec link_dock node dist-server/server/cli.js updates
docker compose -f compose.rpi.yaml exec link_dock node dist-server/server/cli.js update-tools
docker compose -f compose.rpi.yaml exec link_dock node dist-server/server/cli.js auto-updates off
docker compose -f compose.rpi.yaml exec link_dock node dist-server/server/cli.js rollback-tools
docker compose -f compose.rpi.yaml exec link_dock node dist-server/server/cli.js restore-tools
```

Read `README.md` for update sources, persistence, resource limits and compatibility. Physical Pi/ARM64, real provider
access, signed-repository update downloads and mobile rendering remain deployment checks.

## New in version 2.11: set the completed folder once

1. Open **Settings → Station controls → Completed downloads**.
2. Enable **Automatically move completed downloads**.
3. Leave **Default completed folder** as `.` for the mounted completed folder, or enter `Movies` for a subfolder.
4. Click **Save preferences**. New downloads now inherit the destination, including batch links, magnets and torrents.

With the supplied Pi Compose file and `LINKDOCK_DOWNLOAD_PATH=/home/pi/downloads/linkDock`, `.` means completed files
appear under `/home/pi/downloads/linkDock/completed/<job-uuid>/files/`. `Movies` means
`/home/pi/downloads/linkDock/completed/Movies/<job-uuid>/files/`. Original filenames are preserved within job folders.

The setting survives restarts and applies across devices. It starts disabled to preserve existing installation behavior.
Existing jobs retain their destination; use their optional **Move on completion** override to move them. Clearing an
individual job's destination opts it out. Changing only the global folder does not interrupt active transfers. Disabling
it affects future jobs only. A failed move retains internal files and offers **Retry move**.

Keep your completed-directory bind mount and app state. Rebuild/recreate the image as above; no new environment
variables or dependencies are required. The UI accepts a relative folder beneath the existing completion mount, not a
host absolute path. Root-destination records need the updated server; downgrade using a matching backup.

## New in version 2.12: Library and Settings pages

Use the sidebar or phone navigation to switch between **Overview**, **Library** and **Settings**.

- Add links and review live totals on **Overview**.
- Track downloads, choose torrent files, search saved files and use previews/save actions on **Library**.
- Open **Settings → Station controls** for the global completed folder, speed limits, free space and daily window.
- Open **Settings → On this device** for dark/light appearance, installation and optional browser alerts.
- Open **Settings → Download utilities** for automatic checks, manual updates, rollback and restore.
- Open **Settings → Station health** for system/storage/engine diagnostics.

Switching pages preserves unsaved drafts and local library filters; it does not pause downloads. Open video previews
pause when you leave the Library. Bookmarks, browser Back/Forward and reloads work for `/#main`, `/#downloads` and
`/#settings`. Shared links still open the composer. Every page remains behind the station password.

Rebuild/recreate the image using the commands above and reload your browser. Keep the same `.env` and all storage
mounts. No new environment variables or data migration are needed. Drafts last for this open session, not a full reload.

## New in version 2.13: browser verification and additional video sources

- Auto detect now recognizes 29 video/audio platform families. Search **Settings → Connected sources** for the list. Use
  **Video** for other yt-dlp-supported pages; audio sources can use **MP3 audio**.
- Open **Settings → Browser verification & waits** to import a site-only Netscape `cookies.txt` export after you
  complete verification/login in your own browser. Enter the matching User-Agent if the site requires it, then Restart
  the job.
- For countdown pages that expose a final file URL, open **Browser assistance** on the failed item in Library. Complete
  the CAPTCHA/countdown in your browser, paste the final URL and choose **Queue final file link**. A new direct-file job
  is created; the original record remains. Blob URLs and browser-only verification may not work.
- Direct files wait for explicit HTTP 429/503 `Retry-After` delays, up to two retries of 120 seconds each. Pause/Cancel
  interrupts waits. Longer waits need manual retry. Video extractors handle only countdowns they support.
- Add a 0–60 second video request delay in the same Settings panel. This affects yt-dlp, not Instagram collection.

CAPTCHAs remain user-assisted. There is no automatic solver, universal JavaScript browser or DRM unlock. Verification
may be tied to the browser, TLS fingerprint or public IP. Use the same public IP as the Pi where possible. Cookie
imports grant account access: send site-only exports to your trusted station over HTTPS and protect private backups.
Imported cookies override the mounted media jar; removing them restores that fallback. Direct files use imports only.

Rebuild/recreate the image and reload your browser as above. No new mounts, environment variables or dependencies are
needed. Keep the private credentials directory under `/data`. Test the actual protected sites on your Pi; source support
and transferable verification are not guaranteed by an extractor entry.

### DeviantArt

Choose **DeviantArt** (or Auto detect) and paste an artwork/story, gallery, gallery-folder or artist-profile URL. For an
entire gallery use `https://www.deviantart.com/ARTIST/gallery/`. A profile collects its accessible gallery and journals.
Stories/literature/journals save as `.txt`; artwork/photos and available videos retain their source formats. The
collector uses available originals rather than the video quality/MP3 controls. Files appear in Library with normal
save/ZIP actions, and use your global completed-folder preference. Large galleries remain subject to the size and
2,000-file limits. Galleries exceeding limits fail rather than claiming a complete collection.

Gallery-dl is reused and updated by the existing utility updater. Cookies can help with some sources; private or
subscriber-only DeviantArt works may need OAuth or remain inaccessible. Version 2.14 adds optional OAuth token setup in
Settings; access restrictions still apply. Here stories means published literature/journals, not ephemeral stories. Live
acceptance on the Pi remains pending. Preserve history and matching backups before downgrading to a server without
DeviantArt source support.

## New in version 2.14: saved DeviantArt controls

Go to **Settings → DeviantArt collections & account**. Select which profile collections to include: artwork/videos,
journals/stories, scraps, favorites and status posts. Save your original-file preference and TXT/HTML/skip story format
once for the station. A specific gallery or post URL retains its own scope. Defaults preserve gallery + journals,
original files and plain TXT. Version 2.15 pins these choices when a new job is queued. Existing jobs keep their
snapshot when paused, resumed or restarted; changed Settings apply to newly queued jobs.

For account access, version 2.18 adds **Continue to DeviantArt** directly in Settings. Complete the one-time application
setup below, then sign in on DeviantArt. LinkDock retrieves and saves the refresh token automatically. The advanced
manual-import form remains available for existing grants. Only manual imports defer credential validation to the next
download; in-app sign-in performs the actual authorization-code exchange before reporting a connected account.

Tokens rotate. Preserve all of `/data/credentials/deviantart`, including its private cache, across container
recreations. Your bind mount retains this under `/home/pi/configs/linkDock/credentials/deviantart`. Do not reuse the
same grant in another downloader. Reauthorize if an expired grant or lost cache prevents access. Pause all DeviantArt
jobs before replacing/removing credentials; the UI reports a conflict while the source is busy. Transfers to DeviantArt
are serialized with cancelable waiting; other sources can use remaining queue slots. Removing credentials deletes local
account caches and retains collection preferences, but upstream grant revocation is managed on DeviantArt.

Rebuild the local image and recreate the service, then reload the browser:

```bash
docker build -t localhost:5000/link_dock:latest .
docker compose up -d --force-recreate --pull never link_dock
```

No new environment variables or mounts are needed. Keep your existing state and separate download/completed mounts.

## New in version 2.15: collection recovery and file browsing

DeviantArt jobs now retain the collection choices that were saved when you queued them. Review these in **Library →
Collection choices**. Saving new Settings does not change a paused or queued job. To collect a different scope or story
format, save Settings and add the same link again; duplicate checks distinguish those options.

On upgrading, older completed jobs remain usable. An older unfinished DeviantArt job with partial files but no recorded
scope stays paused, with a Restart instruction. Its bytes are preserved. Resume all skips it; individual Resume is
blocked. Choose **Restart from the beginning** to discard that partial staging and use current Settings, or keep it
paused and add a new job. Older jobs without partial files record current Settings before starting. Normal pinned jobs
resume using their own choices. Tokens and login cookies remain separate from these saved collection choices.

For a completed collection, open **View N files**. Search names/folders, filter by file type, sort by name or size and
page through 25 files at a time. File links and previews stay tied to the correct original file after filtering or
sorting. Closing the collection resets these browser filters. **Save all as ZIP** includes all saved files, even while a
filter is active. Opening/searching a collection does not fetch file contents; previews still require a click.

Rebuild/recreate using the commands above, then reload the browser. Keep the existing state/download/completed mounts;
no new variables or dependencies are required. Stop the old container first and use one service per state directory.

## New in version 2.16: Pornhub and similar video sites

Paste an individual Pornhub video or supported embed URL using **Auto detect** or **Video**. Select a video resolution
or **MP3 audio**, then add the download. Pornhub, XVideos, XNXX, xHamster, YouPorn, RedTube and SpankBang appear in
**Settings → Connected sources**. Existing quality, batch review, browser cookies, completion folders and tool updates
are reused. The source catalogue now recognizes 36 platform families.

If a video requires a signed-in browser session, import your site cookies under **Settings → Browser verification &
waits**, optionally enter the matching User-Agent and restart the failed job. Actual availability depends on the source,
account access, region and installed extractor. No live download from these sites was performed during validation.

Rebuild and recreate with the existing commands, then reload the browser. No new mounts or dependencies are needed.

## New in version 2.17: another quality or MP3 from Library

Open **Download another version** on a Video item in Library. Its current request is shown as a video quality ceiling or
MP3 bitrate. Choose the new output/quality and select **Queue this version**. This creates a fresh job from the original
website; it downloads the source again. Original saved files and partial progress remain intact. The new job uses the
current global completed-folder preference and station defaults. Labels and per-job destination overrides remain on the
original. An already-saved/queued matching version is blocked; failed/canceled jobs can queue another attempt. The next
normal queue refresh shows the accepted job.

Recognized media errors now show recovery hints: another quality for a missing format, source settings for login or
verification, waiting/reduced requests for rate limits, and health/tool updates for missing utilities. Suggestions are
inferred from engine messages and may be incomplete. Raw diagnostic output is not displayed or saved in history.
Ordinary Restart still retries the original job with its saved quality. No variant, retry or source request happens
automatically when you open Library. Older records remain readable and keep generic assistance.

Rebuild and recreate the service, then reload your browser. Existing mounts, credentials and utility updates continue to
work. No additional environment variables or dependencies are required.

## New in version 2.18: connect DeviantArt in the app

1. Pause active DeviantArt downloads. Open **Settings → DeviantArt collections & account → One-time app setup**.
2. Copy the displayed **OAuth callback URL**. At
   [DeviantArt Applications & Keys](https://www.deviantart.com/developers/apps), register a **confidential** application
   and add that exact URL to its OAuth redirect URI whitelist. Save its client ID and secret in LinkDock's setup form.
   This is a one-time registration; subsequent account connections do not require retrieving/copying refresh tokens.
3. Choose **Continue to DeviantArt**, sign in there and approve access. The same browser returns to Settings after
   LinkDock retrieves and privately stores the refresh token. Refreshes run automatically as downloads need them.
4. Open Library and **Restart** the affected download. Restart clears that job's previous partial staging. Completed
   downloads remain intact. An issued token does not override file permissions, site quotas or browser challenges.

Use the same station address during setup and sign-in. At `http://192.168.1.50:7489`, the callback is
`http://192.168.1.50:7489/api/deviantart/oauth/callback`; use the exact URL accepted by DeviantArt's registration. For a
reverse proxy, configure the browser-facing HTTPS `PUBLIC_ORIGIN` and `SECURE_COOKIE=true`, recreate the service, then
register the HTTPS callback shown in Settings. The gallery-dl localhost callback cannot return directly to the Pi. No
new container port or mount is needed. Keep the existing `/home/pi/configs/linkDock` bind mount.

DeviantArt rate-limit and CloudFront retry loops now stop with a clear recovery message. Rejected credentials prompt
reconnection; source request limits prompt waiting before retrying. Silent downloads stop after three minutes without
file progress. Growing files and distinct completed/skipped file messages count as progress; repeated diagnostics do
not. Ordinary HTTP operations use a 30-second timeout and three retries. Browser blocks still require source access or
verified cookies; the application does not solve CAPTCHAs or bypass restrictions.

Update using the source in this archive, from the directory containing its Dockerfile and your Compose file:

```bash
docker build -t localhost:5000/link_dock:latest .
docker compose up -d --force-recreate --pull never link_dock
```

Reload the browser after recreating the container. Your private app registration, account and rotating token cache stay
under `/data/credentials/deviantart` in the existing bind mount. If the container restarts during sign-in, start again.
Removing an account keeps reusable app setup; provider-side grant revocation is managed on DeviantArt.
