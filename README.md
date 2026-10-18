# LinkDock 2.10

A private download studio for your Raspberry Pi: videos, Instagram moments, torrents and files, collected in one place.
The dark-first React + TypeScript workspace has a saved light/dark preference, source selection, real progress,
searchable history, batch review, queue priorities and individual access to every completed file. Downloads run on the
Pi when your browser is closed.

## Bulk actions for your library

Select individual download checkboxes or choose **Select visible · up to 50**. This captures the currently visible
records, in their displayed order. New arrivals from polling are never selected automatically. Changing search, folder,
tag or status filters clears selection and any deletion review. A selected record that disappears from the current view
during polling is dropped and invalidates the review; it is not automatically reselected if it later returns. Choose
**Clear selection** to leave every record unchanged.

Open **Organize selected** to make a partial edit across the selection. Folder changes are opt-in: enable **Change
folder for all selected** and enter a folder, or leave it empty to move the selection to **Unfiled**. Tags default to
**Keep current tags**. You can instead add tags, remove matching tags without regard to case, or explicitly replace all
tags. An empty replacement clears tags. Untouched fields preserve each job's own values; adding an existing tag keeps
its current display spelling. Folder and tag changes can be applied together to active, paused or finished jobs.

Every merged label set must satisfy the existing eight-tag limit. The server resolves the entire selection and validates
all resulting labels before a single atomic history write. Invalid labels, a missing record or a failed write leave all
previous labels intact. Concurrent edits in another browser use the last successful save, with merges based on current
server values. Organization never moves physical files.

For permanent removal, select only **completed, failed or cancelled** records, then choose **Review deletion**. Review
shows the fixed filenames and recorded bytes; **Keep downloads** dismisses it. **Permanently delete** removes those
records and their associated files from the Pi. This cannot be undone. Recorded bytes are not a guaranteed disk-space
estimate. Waiting, running and paused records cannot be bulk-deleted; cancel or finish them first.

The server checks every member's current status, worker cleanup and ZIP-export lease before deleting anything. A missing
record or blocked member rejects the entire request. Filesystem deletion then runs sequentially, saving each successful
removal. It is not a filesystem transaction: an I/O failure can remove some files before a record fails. The toolbar
reports successful and failed counts, retains failed selections and requires a separate review before retrying. A
history-write failure restores the record in memory so it remains retryable, but cannot restore bytes already deleted.
Back up the complete station volume if you need recovery. Network failures can also leave an outcome uncertain; refresh
and review the collection before retrying. There is no automatic destructive retry.

Bulk commands use authenticated, JSON-only `POST /api/downloads/bulk` with at most 50 unique existing UUIDs. An
organization request uses `action: "organize"`, `ids` and optional `folder`, `tagMode` (`add`, `remove`, `replace`) with
`tags`. A deletion uses `action: "delete"`, `ids` and `confirmation: "delete-selected-files"`. Explicit IDs bound the
operation even if another client adds records. The existing cookie, origin and no-store protections apply. Selection and
draft changes remain browser-local; the new toolbar wraps on phones and uses the existing dark/light palette.

## Preview saved media and export a ZIP

Completed JPG/JPEG, PNG, GIF, WebP, MP4 and WebM files can show an explicit **Preview image/video** button. Nothing is
fetched until you choose it. The station first checks the saved file and its bounded media header, then the browser
opens the original bytes. **Close preview** removes the image/player; **Save original** is always available. Multi-file
jobs expose these controls per artifact inside **View files**. Unfinished output stays private.

Video uses native controls, inline playback and a muted initial state without autoplay. Enable sound in the player.
Seeking uses authenticated single-byte-range requests. Container recognition does not guarantee codec support: when the
browser cannot display a file, save it for a compatible local player. MKV, SVG, HTML, PDF and other formats remain
ordinary attachment downloads. No Pi-side transcoding, thumbnail generation or active-document viewer is involved.
Raster previews are limited to **25 MiB per file**; larger images retain their normal save controls. Header checks
recognize media prefixes rather than certifying that an entire file can be decoded. Previews still consume the original
file's bandwidth and browser memory. Closing or filtering away a row cancels pending setup and removes its player.

All previews require the existing station session. The service streams from the validated open descriptor, checks
manifest size, rejects symlinks/path escapes and sends an explicit media MIME type, `nosniff`, restrictive content
policy and `Cache-Control: no-store`. The public-only service worker does not cache these API bytes. Missing files,
unrecognized headers and expired sessions produce inline guidance before a player is opened. A saved file changed
outside LinkDock can require restoring its complete backup.

For a completed multi-file job, open **View files** and choose **Save all as ZIP**. The station checks the published
manifest, then hands the streamed attachment to your browser's download manager. It includes exactly those published
files, retaining nested structure and empty files; unlisted files, engine state, station settings, cookies and source
URLs are not added. Normal individual save buttons remain available.

ZIP entries use stored data without extra compression, keeping CPU use practical for a Pi and already-compressed media.
The archive is approximately the original total size plus headers. Files are opened lazily with bounded buffers;
LinkDock does not create a temporary archive or read the whole collection into RAM. The ZIP library provides ZIP64 when
needed; multi-gigabyte/ZIP64 transfers still require acceptance testing on your Pi and target archive tool. Portable
names replace control/reserved filename syntax, shorten long UTF-8 components and resolve normalized, case-insensitive
file/directory collisions with numeric suffixes. Original saved files and display names stay intact.

At most **two ZIP exports** can run station-wide. A busy station explains this before requesting the attachment. A job
cannot be deleted while its ZIP is being prepared or sent; finish the download or cancel it in your browser first. A
browser disconnect or 30 seconds of idle connection time stops delivery and releases file descriptors/export slots. ZIP
downloads are **not resumable**: a connection loss or container restart requires a fresh save. They are browser file
transfers, so they do not appear as new source-download jobs and are outside the station's source speed budgets.

The server rechecks file identity and size when each archive source opens. Do not modify managed data from another
program during export; changes can interrupt delivery after bytes have started. HTTP header preflight improves error
feedback but does not reserve a slot between the check and the actual browser download. A concurrent change or newly
occupied slot can still cause the browser request to fail. Restart the save after resolving the issue.

Owner-only routes are `GET/HEAD /api/downloads/:id/preview`, `/preview/:index` and `/archive`. Previews accept one byte
range (explicit, open-ended or suffix); malformed/multiple ranges return 416. An unvalidated `If-Range` condition falls
back to the full representation. Archives reject range/resume requests, and a busy archive service returns 429 with
`Retry-After`. Headers do not load the entire preview or create an archive body. All existing cookie/origin boundaries
remain in force.

## Organize your collection

Expand **Organize download** below any job to save one folder and up to **8 tags**. Folder labels accept up to 64
characters; each tag accepts up to 32. Separate tags with commas. Labels use normalized Unicode, trimmed/collapsed
whitespace and no slashes, control characters or dot paths. Duplicate tags ignore case while keeping the first display
spelling. Folder names remain case-sensitive. Leave fields empty and save to remove the labels.

Folders are logical collection labels. The original display filename, UUID storage path, saved bytes, progress and
transfer state stay intact. You can organize active, waiting, paused and finished downloads. Labels persist in
`history.json` and travel with the complete data-volume backup. An invalid edit or failed history write preserves the
previous labels. Old jobs appear as **Unfiled** until organized.

Use **Folder**, **Tag**, the lifecycle tabs and **Search downloads** together. Search matches filenames, folder labels
and tags without changing the queue schedule. **Clear filters** returns to the whole collection. Selected labels remain
in the selectors if the last matching record disappears, so an empty filtered view can always be cleared. Result counts
reflect the combined filters; options are drawn from the whole retained collection.

Draft label edits survive progress polling. **Reset labels** loads the latest observed saved values. Saving replaces the
job's complete folder/tag set; if several browsers edit the same job, the last successful save wins. A collapsed editor
retains its draft while that row remains in the current view; changing filters or reloading can discard unsaved edits.
Folder-wide rename remains future work. Completion destinations support nested physical folders. Bulk edits are
available in the selection toolbar.

The protected JSON endpoint is `POST /api/downloads/:id/organization`, with the complete object
`{"folder":"Research","tags":["Useful"]}`. It uses the same session, origin and JSON-only mutation checks as queue
actions. Metadata fields are optional in old history; malformed saved metadata fails validation rather than being
silently erased.

## Check station health

Open **Station health** below **On this device** for a private operational snapshot. It reports the actual Node version,
platform/architecture, LinkDock process uptime and resident memory, data-filesystem capacity/free space, directory write
permissions, queue counts and any current schedule/storage hold. A restricted runtime can report **Unavailable** for a
measurement. Process memory and station uptime describe LinkDock; filesystem capacity includes other files on that same
volume. Permission checks are a snapshot, not a disk integrity or quota test.

The panel runs local version commands for yt-dlp, gallery-dl, aria2 and ffmpeg, showing versions, timestamps and static
recovery guidance for missing or failing tools. Checks start only when the panel is opened or refreshed. Engine results
are cached for one minute across browsers; refresh updates station measurements while retaining that engine cache.
Commands run sequentially, without a shell, with a three-second timeout, forced termination and an 8 KiB output limit
per command. Four slow commands can take about twelve seconds. Closing the panel cancels its browser request; a shared
server inspection can finish for other callers. No media provider, account or peer swarm is contacted by these checks.

**Available** means the version command succeeded. Verify an actual small source download to check provider access,
cookies, formats, codecs and torrent peers. Use **Download utility updates** below the engine checks for automatic or
manual updates. The image still supplies pinned fallback tools; ffmpeg and base-library changes require an image
rebuild. If storage is unavailable, check its mount, available space and UID 1000 ownership; the last displayed snapshot
remains visible when refresh fails and is explicitly marked as potentially old.

Detailed diagnostics use authenticated `GET /api/station` with `Cache-Control: no-store`, omitting paths, source URLs,
credentials and browser push registrations. The public `/api/health` remains the existing minimal process probe used by
Docker. It does not certify engine, storage or source readiness.

### System view and optional Pi temperature access

Version 2.8 adds a separate **System view** inside Station health. It shows OS-visible CPU thread count, the
1/5/15-minute load averages, system uptime and total/free memory. These counters can describe the physical host, a
Docker Desktop VM or another OS view supplied by the runtime. They are **not container CPU/memory limits**,
LinkDock-only usage or CPU utilization percentages. The thread count is the OS-visible CPU list, not a promise of CPU
quota or parallel capacity. Memory uses the OS total/free counters; no available-RAM budget or used-memory percentage is
inferred. Windows load averages are marked unavailable rather than presenting its unsupported zero values as measured
activity.

Each counter can independently show **Unavailable** when restricted or unsupported; valid zero free memory/load/uptime
is retained. System readings have their own timestamp, a shared **five-second cache** and single-flight sampling.
**Refresh status** retains the existing one-minute engine cache, so system and engine timestamps can differ. System
sampling starts only after an authenticated health request. It does not run a periodic background monitor, save metric
history or contact any remote service. Hostnames, CPU model strings, serial numbers and network addresses are omitted.

CPU temperature uses a recognized Linux thermal-zone type: `cpu-thermal`, `cpu_thermal` or `x86_pkg_temp`. It first
tries `/run/linkdock-thermal`, then `/sys/class/thermal/thermal_zone0`. Unknown types are skipped rather than being
labelled CPU temperature. Each `type`/`temp` field is read with a **256-byte** bound, nonblocking open and no final-file
symlink following. Values must be integer millidegrees in a broad -40 to 150 Celsius plausibility envelope. This
envelope is input validation, **not a model-specific safe operating range**. Temperature displays Celsius with one
decimal place.

A temperature probe has a **500 ms response deadline**. If a physical kernel read outlives it, subsequent inspections
retain useful OS counters and avoid launching more thermal probes until that read settles. Missing, unsupported,
permission-denied or timed-out sensor data produces explicit guidance. The panel cannot certify cooling, fan behavior,
undervoltage, throttling state, power quality or drive health; it does not change cooling or download policy.

On a Linux Raspberry Pi where Docker hides the sensor, verify its type and readability on the Pi:

```bash
cat /sys/class/thermal/thermal_zone0/type
cat /sys/class/thermal/thermal_zone0/temp
```

If this is the CPU zone, enable the supplied **optional** override:

```bash
docker compose -f compose.yaml -f compose.metrics.yaml config
docker compose -f compose.yaml -f compose.metrics.yaml up -d --build
```

`compose.metrics.yaml` mounts only that existing zone at `/run/linkdock-thermal`, read-only. It retains the normal
unprivileged UID, dropped capabilities, read-only root filesystem and data volume. The source is not created if missing;
leave the override disabled on systems without that zone. The bind does not bypass host read permissions. If your CPU
zone uses another index, change only the override's source to that exact verified zone; keep its target unchanged.

When also using cookies, include both overrides on every subsequent Compose invocation:

```bash
docker compose -f compose.yaml -f compose.cookies.yaml -f compose.metrics.yaml up -d --build
```

No new environment variables, JavaScript dependencies or persistent-data fields are needed. Reload the browser after
rebuilding. Real Pi sensor exposure, Docker mount behavior and responsive device rendering remain acceptance checks. The
standard deployment continues to work with unavailable temperature values when the override is omitted.

Implementation references: [Node OS counters][os-counters], [Linux thermal sysfs][thermal-sysfs] and [Compose long bind
syntax][compose-bind].

[os-counters]: https://nodejs.org/download/release/v24.19.0/docs/api/os.html
[thermal-sysfs]: https://docs.kernel.org/driver-api/thermal/sysfs-api.html
[compose-bind]: https://docs.docker.com/reference/compose-file/services/#volumes

## Pause, resume and unattended operation

Use the pause icon to retain a job's partial progress; use the play icon to requeue it. Manually paused jobs stay paused
across service restarts. Interrupted active jobs automatically requeue when the station starts. Time and storage
controls still apply to resumed or recovered work. Cancellation discards partial files. **Restart** also discards
partial data and begins from zero; failed and cancelled jobs use this action. Deletion removes the record and any
retained files.

| Source             | Resume behavior                                                                 |
| ------------------ | ------------------------------------------------------------------------------- |
| Direct file        | Appends only with a strong ETag, same final URL and matching byte range.        |
| Torrent or magnet  | Reuses pieces/control files and verifies hashes; metadata may be fetched again. |
| Video or Instagram | Reuses engine partial files and completed items where the source permits.       |

Direct sources without a strong validator, sources that ignore ranges, changed final URLs and changed files restart
safely from zero. Invalid range responses are never appended to existing bytes. External-engine continuation is best
effort: expiring URLs, changed media formats, fragment protocols and source behavior can require starting again. A live
swarm or authenticated media resume has not been verified in this environment. Media merge work may repeat.

Open **Station controls** below the composer to configure:

- Download speed and torrent upload limits, in **KiB/s**; zero means unlimited.
- A daily start/end window in an explicit **IANA timezone**, such as `Europe/Athens` (the default). Overnight windows
  and daylight-saving changes are supported; start is inclusive and end is exclusive. A disabled window allows all
  hours.
- A free-space buffer, in whole **GiB**, defaulting to **1 GiB**. Jobs wait below this threshold and resume after space
  is freed. Zero disables the configured buffer. No completed files are automatically deleted.

Preferences are saved on the Pi, shared by every browser and retained in backups. Saving changed preferences reconnects
active workers so the new limits take effect; sources that cannot resume may start over. Saving unchanged values leaves
active workers alone. Draft edits survive dashboard polling; **Reset draft** loads the latest observed saved values.

The configured speed budget is divided evenly among the configured queue slots, including idle slots. With a download
budget of 2,048 KiB/s and two slots, each job receives up to 1,024 KiB/s; a single active job keeps that allocation.
This conservative allocation works across engines. Metadata, protocol overhead and browser save-to-device traffic are
outside these limits; use host network shaping if an exact interface-wide ceiling is required.

The scheduler checks time and free space every five seconds. Direct streams also check before writes; media and torrent
engines check during progress sampling. Space checks can overshoot with concurrent or external writes and do not replace
filesystem quotas. A held direct chunk raises the restart threshold to include that chunk, avoiding a rapid retry loop.
Temporary media merges still need extra room. Free space or lower the buffer to release a storage hold.

The authenticated API exposes `GET /api/settings` and `POST /api/settings` for the complete settings object. Its fields
are `downloadKibPerSecond`, `uploadKibPerSecond`, `reserveGib`, `scheduleEnabled`, `windowStart`, `windowEnd` and
`timeZone`. Rates accept integers from 0 through 1,048,576; reserved GiB accepts 0 through 65,535; times use `HH:mm`.
Enabled start and end times must differ. Invalid values are rejected before replacing saved preferences. Settings use
the same cookie, JSON-only mutation and origin checks as downloads. The queue's existing `/api/downloads/:id/retry`
action remains the wire-level name for Restart; `/pause` and `/resume` add the retaining-progress actions.

## Phone and tablet use

Open the same station URL from your phone or tablet on the Pi's network. The website works without installation. The
phone layout provides Overview, Add link and Library shortcuts, a full-width link composer, large source buttons,
full-width search and download cards with their actions below the file details. Carousel and torrent file lists wrap
long names and expose separate save controls. Dark and light mode both use the same responsive layouts.

Primary phone controls have at least 44-pixel touch targets. Text-entry fields and selection controls use 16-pixel type
on small screens and touch devices. Layouts include display-cutout safe-area spacing, preserve browser pinch zoom and
respect reduced-motion preferences. No fixed navigation covers the link field when a software keyboard opens.

The responsive breakpoints cover compact phones from 320 CSS pixels, wider phones, tablets, desktop and large displays.
Real-device Safari/Chrome and rendered viewport verification are still required; see `VALIDATION.md` for a test matrix.
Saving from the dashboard copies a file from the Pi to the current device; source downloads continue on the Pi.

### Install and share links

Use an HTTPS station address, unlock it and open **On this device** below Station controls. Choose **Install LinkDock**
when the browser offers that button, or use **Install app / Add to Home Screen** from the browser menu. Installation,
share targets and notifications depend on the browser and operating system; ordinary link pasting remains available.

After installation, supported phone share menus can send an HTTP(S) or magnet link to LinkDock. The composer retains
candidate links in memory through the password gate, removes the share payload from the address bar and requires your
review and submission. Sharing never starts a download automatically. Titles are ignored. Signed query strings are
preserved. If an app shares several links, the composer extracts up to 50 unique candidates for review.

An offline navigation shows a public reconnect page. It does not queue or save shared links: reconnect and share again
or paste the link. The service worker caches only that fixed public fallback and two icons. It does not cache the
private dashboard, API responses, original source links, credentials or downloaded files. Downloads still run on the Pi
while the browser is closed; the dashboard itself requires a connection.

See the [MDN share-target reference][share-target] for platform semantics.

### Batch review and queue priorities

Paste up to **50 links**, one per line. A multiline submission first shows **Review**, with the new-download count and
skipped duplicate links. Choose **Queue** to submit the reviewed batch. The station revalidates at commit time; any
invalid link or history-capacity failure rejects the entire batch before adding records. Workers start only after the
new records are saved together. This makes queue acceptance atomic; each transfer can still succeed or fail separately.
A single link continues to use Add download and reports an existing duplicate inline.

Duplicate matching uses the normalized source URL, resolved source type and video quality. HTTP fragments are ignored;
signed query parameters remain significant. Equivalent hex/base32 magnet info hashes match even when display names or
trackers differ. Failed and cancelled jobs may be added again. Different aliases, shortened URLs and cross-engine
representations are not compared by downloaded content. Uploaded torrent files are accepted individually.

Waiting and paused jobs expose **High / Normal / Low** priority selectors. Waiting jobs start by priority, oldest first
within each level; a batch preserves its input order. A priority change never interrupts an active transfer or releases
a manual pause. Priorities persist through restarts; older jobs default to Normal. The Active view shows running jobs,
then the waiting schedule, then manual pauses. The All view keeps the history's newest-first order. Continuous High
priority work can delay lower priorities; there is no automatic aging or drag-and-drop ordering.

### Optional completion and failure alerts

First configure HTTPS as described below, then add these values to `.env`, using your real contact address:

```dotenv
SECURE_COOKIE=true
PUBLIC_ORIGIN=https://downloads.example.com
WEB_PUSH_SUBJECT=mailto:you@example.com
```

Recreate the container with `docker compose up -d`. The station creates private VAPID signing keys on its persistent
volume. Unlock the HTTPS station on each device, open **On this device**, choose **Enable alerts on this device** and
accept the browser permission prompt. No permission prompt appears just from visiting the site. Some platforms require
an installed Home Screen app. Use **Send a test alert** to check setup. Downloading does not depend on alerts.

Alerts use encrypted Web Push with generic completion/failure text, without filenames or source links. Provider
acceptance does not guarantee device delivery. The provider can observe destination and delivery metadata; your contact
is part of VAPID authentication. The Pi needs outbound HTTPS/DNS access to each browser's push provider, and the device
needs its normal push connectivity. The station accepts at most 32 registered browsers, with two concurrent deliveries,
a five-second lookup/request bound per attempt and no provider redirects. Public DNS is checked and pinned for sends.

Newly saved completion/failure transitions enqueue generic alerts for exactly the devices registered at that moment.
Cancellation, pauses and restored download history do not create new alerts. Version 2.7 restores alerts already saved
in its private outbox, so pending deliveries can survive a container restart. New registrations and rotated browser keys
do not receive older pending events. Refreshing an unchanged registration retains its pending work. The browser groups
notifications into a replaceable LinkDock alert. Open the download queue for authoritative file status. Tapping an alert
opens the station; authentication still applies.

### Durable alert delivery

The outbox lives at `/data/notifications/outbox.json`, alongside the existing private signing identity and browser
registrations. It stores only a generic completed/failed category, an opaque fingerprint of the exact registration,
record ID, timestamps and attempt count. It does not duplicate subscription endpoints, encryption keys, download IDs,
filenames, source links or provider response bodies. Back up the complete private notification directory with the rest
of the volume. The backlog is restricted to owner permissions, at most **64 records** (two categories per 32 devices)
and a **64 KiB** input file. Each device/category pair has at most one record, including during delivery. Further events
coalesce without extending its expiry or resetting its attempts; one generic alert can represent a burst of downloads.

Temporary network/DNS failures, HTTP 408/429 and provider 5xx responses retry automatically. There are at most **six
attempts total** per record. Backoff starts at **30 seconds**, doubles and is capped at **10 minutes**. A longer valid
provider `Retry-After` delay is honored within that same cap. A 30-second scheduler sweep can add latency; timestamps
are scheduling targets. Records expire from the Pi backlog **one hour after enqueue**, including across restarts. Keep
the Pi clock synchronized. Expired/exhausted entries are removed. HTTP 404/410 revoke the registration and all its
queued categories. Other permanent provider responses are discarded without automatic retry; explicit tests show their
errors immediately and are never added to the durable backlog. Provider-side TTL and device behavior can delay actual
display after acceptance.

An attempt count and its next retry time are atomically saved **before** the network request. Provider acceptance
removes the record. A crash after acceptance but before that removal can cause a duplicate generic alert; a crash just
after claiming can consume an attempt without sending. History and alert files are separate transactions, so a crash
between the terminal history save and outbox enqueue, or a storage failure during enqueue, can still miss an alert. This
is bounded best-effort delivery, without exactly-once guarantees or device display receipts. Graceful shutdown keeps
pending records and waits only for already bounded network requests. Downloads do not wait for provider retries.

Malformed or unwritable outbox state suspends automatic alerts and shows an unavailable status; it does not overwrite
that state or stop downloads. Resolve disk space/permissions and restart to retry preserved work. For a corrupt backlog,
stop the container, back up the full data volume, move only `notifications/outbox.json` aside and restart. This discards
pending generic alerts while keeping `vapid.json` and `subscriptions.json`. Never modify managed state while running.
Disabling HTTPS/alert configuration leaves saved state dormant; re-enabling prunes expired or revoked work before sends.

Open **On this device → Alert delivery · all registered devices** for private aggregate pending, previously attempted
and in-flight counts, plus the earliest scheduled attempt in your device's time. Counts overlap and are a snapshot;
**Refresh delivery status** updates them. This panel loads only when opened. It displays no other device identifiers or
notification contents. **Clear pending alerts** explicitly clears the station-wide backlog, without disabling browser
registrations or sending any tests. Already-sending requests cannot be recalled, and later download events can enqueue
new alerts. Closing/reopening cancels stale status requests without overwriting a newer snapshot.

Owner-only `GET /api/notifications/outbox` returns aggregate status; JSON-only `DELETE` on the same path clears it. Both
use the existing session/origin checks and `Cache-Control: no-store`. Explicit test alerts share the two outbound
request slots with background delivery; a busy test returns an error rather than creating an unbounded request queue.
Private webhooks and a permanent alert history remain future work.

**Disable alerts on this device** revokes its browser subscription first, including when the station is unreachable. The
browser's site settings can also revoke notification permission. Successful server revocation removes its queued alerts;
an already-sending request may still finish. Locking the dashboard, expiring a session or rotating the station password
does not revoke previously authorized push registrations. To revoke every registered browser, stop the container, remove
`/data/notifications/subscriptions.json` from the volume and restart; keep `vapid.json`. To stop all station delivery
temporarily, unset `WEB_PUSH_SUBJECT` and recreate the container. Do not delete the signing identity during ordinary
upgrades. Back up the complete private `notifications` directory with the rest of `/data`; a restored browser can be
re-enabled if its registration has expired.

### Remaining roadmap

The next candidates are container-quota diagnostics, optional private webhooks and richer alert history. Torrent file
review, terminal scheduling and completion destinations are implemented in version 2.9. OS-visible system readings and
optional CPU temperature are implemented in version 2.8, durable alert retries in 2.7, bulk library actions in 2.6 and
media/ZIP delivery in 2.5. Any retention policy should show what it will remove and require explicit owner
configuration. Bundled engine versions stay pinned; runtime utility updates can be disabled for a frozen installation.

[share-target]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target

## New in version 2.10

### Video resolution and MP3 audio

The composer now separates **Output format** from **Video quality** or **Audio quality**. Video choices are best
available or up to 2160p/4K, 1440p, 1080p, 720p, 480p and 360p. These are source-stream height ceilings, not upscaling
or forced video re-encoding. The default remains up to 1080p; available source formats determine the actual result.

Choose **MP3 audio** to extract/convert audio at a target 128, 192 or 320 kbps. The default is 192 kbps. The downloader
prefers an audio stream and falls back to extracting a combined video/audio stream. ffmpeg performs conversion and the
intermediate source is excluded from published files. A higher target bitrate cannot restore missing source detail;
already compatible MP3 sources may be retained without re-encoding. Converted files have `.mp3` names and ordinary
browser save links. They also support existing completion destinations. Inline MP3 playback is not added in this
release.

Use **Video** or **Auto detect** for these options. Auto routes direct media links through the extractor when MP3 is
selected. File/torrent/magnet modes reject audio extraction. Instagram's dedicated collector keeps original gallery
images/videos; choose **Video** explicitly for an Instagram video that should use the video extractor or MP3 conversion.
Image-only posts do not contain extractable audio. Changing to a non-media source resets/disables media choices.

Quality remains in each job's persisted `quality` field, including new `mp3-128`, `mp3-192` and `mp3-320` values. Batch
review treats separate video/audio representations and audio bitrates as distinct downloads. Retries keep their chosen
representation; legacy jobs preserve their existing quality. The API continues to accept `url`, `sourceType` and
`quality`, with no arbitrary format expressions or ffmpeg arguments. Old servers cannot read the new quality values;
keep a matching pre-upgrade backup if a downgrade is necessary.

### Automatic utility updates

Open **Station health → Download utility updates**. You can enable daily automatic checks, choose **Check & update
now**, cancel a pending/running candidate, roll back to the previous verified set or restore the packaged tools.
Automatic updates are initially enabled in the Docker image, with about two minutes of startup grace and a daily
interval after each attempt. Your saved browser preference takes precedence over the initial `AUTO_UPDATE_TOOLS`
environment default. Manual checks are available even when automatic checks are disabled. Updates wait until active
download workers release their slots, then hold new transfers during preparation. They do not interrupt existing
downloads. A permanently busy queue can defer maintenance; pause jobs if you want to create an idle period sooner.

The updater prepares a complete private utility set under `/data/utilities/releases/<uuid>`:

- yt-dlp with its default EJS dependencies and gallery-dl are installed into an isolated Python environment from the
  fixed HTTPS PyPI index. Only binary package distributions are accepted; dependency checks must pass.
- aria2 and libaria2 are downloaded using APT's normal signed repository/package authentication. The updater uses the
  repositories already configured in the supplied Debian image. It checks dependency compatibility against the base
  image and extracts only those two packages into private storage. It does not install or replace host/system packages.
- Each utility's fixed version command must succeed before the active-release pointer is atomically replaced. The
  previous release remains available, and an unsuccessful attempt keeps the previously selected tools. Incompatible,
  corrupt or missing managed state falls back to packaged tools. Cached health diagnostics can lag by up to one minute.

aria2 follows the latest compatible **Debian repository package**, which can lag upstream aria2 releases. This feature
is not an upstream source compiler. If a newer package needs newer system libraries, rebuild the image rather than
replacing its base libraries at runtime. **ffmpeg, Node, Python, CA certificates and the operating system still update
through image rebuilds.** Runtime updates do not update LinkDock's application source or push/pull your registry image.

Updates run as the application's UID 1000 and work with a read-only container root. They need writable executable
storage under `/data`, outbound access to PyPI/the configured APT repositories and at least 1 GiB free before starting.
Installer temporary files stay in the candidate directory. Sampled free-space, 1 GiB staging and file-count limits plus
per-command timeouts bound ordinary failures; they are not filesystem/kernel quotas. Package payloads can be
redownloaded during a daily refresh. Update traffic has separate fixed network timeouts and does not use download speed
budgets or daily source-download windows. Signed-index caches persist between checks. Run one station per data
directory.

Successful activation uses the new tools for subsequent transfers. The idle torrent daemon is stopped and reaped before
switching, so it restarts with the selected binary. No Docker socket, sudo access or root container user is required.
Abruptly interrupted requests recover as waiting on restart; normal shutdown cancels candidate work. Private incomplete
or inactive release directories are cleaned during later update attempts, retaining the active and previous releases.
Back up `/data/utilities` with the rest of application state. A changed installation path/base Python image makes an old
managed set incompatible; bundled tools remain usable until the next successful update.

**Rollback previous tools** checks the retained release identity/files and selects that previously verified set. Both
rollback and **Restore bundled tools** wait for an idle queue and disable automatic updates. Update failures show the
last safe step in the panel; private command diagnostics go to service logs. Keep `/data` owned/writable by UID 1000,
including any existing files. Source download checks and private job delivery remain unchanged. Real Pi/ARM64,
signed-repository network access and post-update provider downloads still require deployment acceptance.

Your `link_dock` service also supports these terminal commands:

```bash
docker compose exec link_dock node dist-server/server/cli.js updates
docker compose exec link_dock node dist-server/server/cli.js update-tools
docker compose exec link_dock node dist-server/server/cli.js cancel-update
docker compose exec link_dock node dist-server/server/cli.js auto-updates off
docker compose exec link_dock node dist-server/server/cli.js auto-updates on
docker compose exec link_dock node dist-server/server/cli.js rollback-tools
docker compose exec link_dock node dist-server/server/cli.js restore-tools
```

For the default `compose.yaml`, the service name is `linkdock`; substitute that name above. For the standalone Pi file,
include `-f compose.rpi.yaml` if it is not selected through `COMPOSE_FILE`. Commands use authenticated loopback API
access; provider URLs, executable names and shell command text cannot be submitted through the utility API. Protected
`GET /api/utilities` returns safe status. JSON `POST` accepts fixed actions `settings` with boolean `enabled`, `update`,
`cancel`, `rollback` and `restore` through the existing session/origin boundary.

### Your Pi bind-mount configuration

`compose.rpi.yaml` is a standalone example matching the `link_dock` service, host port 7489 and
`localhost:5000/link_dock:latest` image tag. It stores app state at `/home/pi/configs/linkDock`, transfer bytes in
`${LINKDOCK_DOWNLOAD_PATH}/transfers` and moved files in `${LINKDOCK_DOWNLOAD_PATH}/completed`. It uses bind mounts, not
a Docker-managed named volume. The `volumes` YAML section is still the correct place to declare bind mounts.

Keep your existing access token and add/update these `.env` settings:

```dotenv
PORT=7489
LINKDOCK_DOWNLOAD_PATH=/home/pi/downloads/linkDock
AUTO_UPDATE_TOOLS=true
```

Create the exact case-sensitive host directories on the Pi that runs Docker. The following example uses the path above:

```bash
sudo install -d -o 1000 -g 1000 -m 0750 \
  /home/pi/configs/linkDock \
  /home/pi/downloads/linkDock/transfers \
  /home/pi/downloads/linkDock/completed
docker compose -f compose.rpi.yaml config --quiet
docker compose -f compose.rpi.yaml up -d --build
```

The standalone example builds from the extracted source and tags the result locally. If you build/push the image on
another machine, retain your existing registry workflow. On existing installations, preserve/migrate data before
changing mounts and repair existing app-file ownership if necessary. Your earlier history-file permission error needs
ownership of existing files as well as the directory; an empty directory creation does not fix those files. App state
maps to `/data`, transfer storage to `/data/downloads` and completed storage to `/completed`. Keep the container's
`PORT=8080`; the host port is separate. Change the download root to a pre-existing writable SSD path if desired. Keep
optional cookie/sensor/proxy configuration from your own deployment when using a customized Compose file.

## New in version 2.9

### Choose torrent and magnet files

New torrent and magnet jobs fetch metadata first, then pause with **Choose torrent files to continue**. Open **Choose
torrent files**, select the files you want and press **Download selected files**. Select all and clear selection are
available; an empty selection cannot start. The checklist shows relative names and logical byte sizes. Magnet metadata
requires reachable peers even before file names can be shown. A `.torrent` upload or URL provides metadata directly.
File review supports up to 2,000 entries.

Your explicit one-based selection is saved across restarts, reapplied before payload transfer and checked against the
pinned metadata. The per-job size limit applies to selected logical bytes. Only selected files are published. BitTorrent
pieces can span file boundaries, so the engine may temporarily receive neighboring bytes; this is not a strict
network-byte or disk quota. Unselected output and metadata are excluded from saved files. Selection is locked once
approved; pause and **Restart** to review a different selection before payload completion. Restart discards partial
progress. Legacy jobs already in history retain their existing all-files behavior; new jobs require review.

### Terminal commands and one-shot schedules

Run these from the project directory while the container is running. Commands authenticate through the existing
container password and talk to the running server on loopback. They do not launch another queue or accept shell code.
Use `list` to find a job UUID; substitute it for `JOB_UUID` below.

```bash
docker compose exec linkdock node dist-server/server/cli.js list
docker compose exec linkdock node dist-server/server/cli.js pause JOB_UUID
docker compose exec linkdock node dist-server/server/cli.js resume JOB_UUID
docker compose exec linkdock node dist-server/server/cli.js pause all
docker compose exec linkdock node dist-server/server/cli.js resume all
```

`pause all` persists a station-wide gate: current work pauses and newly submitted jobs wait. `resume all` clears that
gate and resumes paused jobs whose torrent file selection is approved. A single-job resume does not clear the global
gate. Daily windows, speed limits, concurrency and free-space holds still apply. Completed, canceled or failed jobs
cannot be resumed; metadata-review torrents need a selection first. Repeating an already satisfied pause/resume is
harmless.

```bash
docker compose exec linkdock node dist-server/server/cli.js pause all --at '2026-10-20T23:00:00+03:00'
docker compose exec linkdock node dist-server/server/cli.js resume all --at '2026-10-21T07:00:00+03:00'
docker compose exec linkdock node dist-server/server/cli.js schedules
docker compose exec linkdock node dist-server/server/cli.js unschedule SCHEDULE_UUID
```

Choose future timestamps within the next year, including seconds and an explicit `Z` or UTC offset. These are one-shot
instants, not local recurring times. UTC-normalized actions and results persist in private `controls.json`, with a
maximum of 64 retained/pending entries. The running server checks about once a second. Overdue actions run in
timestamp/FIFO order before recovered workers start; an action recorded as running is replayed idempotently after a
restart. An offline Pi cannot execute at the requested instant. Pending actions can be canceled; executing actions
cannot. A deleted/unsuitable target records a failure. `all` evaluates eligible jobs at execution time. Check
`schedules` for results. Use Station controls for recurring daily windows.

Additional commands support the same per-job options as the browser:

```bash
docker compose exec linkdock node dist-server/server/cli.js files JOB_UUID
docker compose exec linkdock node dist-server/server/cli.js select JOB_UUID '1,3-5'
docker compose exec linkdock node dist-server/server/cli.js destination JOB_UUID 'Media/Travel'
docker compose exec linkdock node dist-server/server/cli.js destination JOB_UUID -
docker compose exec linkdock node dist-server/server/cli.js retry-move JOB_UUID
docker compose exec linkdock node dist-server/server/cli.js --help
```

`files` lists stable torrent indexes after metadata arrives. `select` requires a paused job awaiting its first
selection; `-` clears an unstarted completion destination. Non-Docker installations can use `pnpm station --help` after
building, with the same `.env` and port as their running server. The access token is read from the environment, never a
command argument. Command results omit source URLs and session credentials. The terminal needs permission to access the
running container or its environment. Keep that password private as with the dashboard.

### Move files on completion

Open **Move on completion** on a job and save a folder such as `Movies` or `Media/Travel`. This is a physical
destination, separate from the logical **Organize download** folder. Leave it empty to retain normal station storage.
The default completion root is `/data/completed` in Docker, or `DATA_DIRECTORY/completed` outside Docker. Paths must be
relative, without dot-prefixed segments, backslashes or traversal. The application refuses symlinked destination
directories.

Each job writes to `<completion-root>/<folder>/<job-uuid>/files/`, preserving selected torrent/media subfolders. A
direct download uses its safe display filename. UUID directories avoid collisions between equally named downloads. These
job directories belong to LinkDock; do not add unrelated files or edit its ownership journal. Browser downloads,
eligible previews and collection ZIP exports continue to use the moved files. **Delete file & record** also deletes that
job's managed destination directory. Other jobs and sibling directories are retained.

Set a destination while downloading, or apply one to an already completed job. Moving a completed job briefly requeues
it and obeys station holds. Payload completion is checkpointed before copying. Files stream into private destination
staging, are flushed, and are published by rename after a SHA-256 recovery journal is prepared. History switches to the
new location before internal originals are removed. Cross-filesystem moves are supported and temporarily need space for
both copies. A pause/shutdown interrupts copying; resume uses saved payload rather than downloading the source again. A
prepared destination from an interrupted history commit is verified before adoption. Existing unowned folders are never
overwritten. This is application recovery, not a substitute for backups or reliable storage hardware.

If a move fails, the job remains available from its internal copy and **Move needs attention** appears. Fix space, mount
availability or UID 1000 write permissions, then choose **Retry move** or use `retry-move`. Retry uses saved bytes.
After payload preparation, the assigned destination is locked for recovery; retry that destination rather than changing
it. Successfully moved files remain at their published location. Keep the configured completion root consistent across
upgrades and back up both `/data` and external completion storage. Private staging or original copies can remain after
an interruption; a retry reuses or replaces only that job's owned staging.

To use a separate USB/SSD directory, first create an existing host directory, for example
`/mnt/storage/linkdock-completed`, and grant container UID/GID 1000 write access. Set this in `.env`:

```dotenv
COMPLETED_HOST_DIRECTORY=/mnt/storage/linkdock-completed
```

Enable the bind mount:

```bash
docker compose -f compose.yaml -f compose.destinations.yaml config
docker compose -f compose.yaml -f compose.destinations.yaml up -d --build
```

The override refuses to create a missing host source and mounts it at `/completed`, setting `COMPLETED_DIRECTORY` inside
the container. Continue using the override when recreating the service. Combine cookie/temperature overrides if already
enabled. Do not put completion output inside the internal `/data/downloads` or metadata directories. Choose the external
completion root before moving jobs; changing it later does not relocate existing saved files. Backups and physical
Pi/cross-device acceptance remain owner deployment checks.

Owner-authenticated JSON API additions:

| Method | Endpoint                               | Payload or result                               |
| ------ | -------------------------------------- | ----------------------------------------------- |
| GET    | `/api/control`                         | Global paused flag and scheduled action history |
| POST   | `/api/control`                         | `action`, `target`, optional `at`               |
| DELETE | `/api/control/:scheduleId`             | Cancel pending schedule                         |
| POST   | `/api/downloads/:id/torrent-selection` | Nonempty one-based `indexes` array              |
| POST   | `/api/downloads/:id/destination`       | Relative `directory` or null                    |
| POST   | `/api/downloads/:id/retry-move`        | Empty JSON; use saved output                    |

## Start here: Raspberry Pi + Docker

Use **64-bit Raspberry Pi OS on an ARM64 Pi**, such as a Pi 4 or Pi 5. Linux AMD64 is also targeted. The application
does not target 32-bit Raspberry Pi OS. Media processing and building the image need more resources than serving the
dashboard; an SSD and a Pi 4/5 are practical choices. Large original-quality video merges can require substantial free
space.

Install Docker Engine, Buildx and the Compose plugin using the [official Debian guide][docker-install]. Check that
`uname -m` prints `aarch64` on the Pi and `docker compose version` succeeds. Your account needs Docker permission;
otherwise prefix Docker commands with `sudo`.

Extract this project onto the Pi, then:

```bash
cd linkdock
cp .env.example .env
openssl rand -hex 32
nano .env
```

Paste the generated value after `LINKDOCK_ACCESS_TOKEN=`. This is your station password. Then:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 linkdock
```

Open **http://YOUR_PI_IP:8080** and enter that password. Find the Pi's address with `hostname -I`. Paste a link using
Auto detect, or choose an explicit source. For a local `.torrent` file, use **Upload .torrent**.

Docker installs Python, yt-dlp, gallery-dl, ffmpeg and aria2 inside the image. You do not need these or Node/pnpm
installed on the host for Docker deployment. The first build needs Internet access and takes longer than the original
direct-file image.

[docker-install]: https://docs.docker.com/engine/install/debian/

## Supported sources

| Mode        | What it saves                                                   |
| ----------- | --------------------------------------------------------------- |
| Auto detect | Recognized platforms, `.torrent` URLs, magnets and direct files |
| Video       | A video from a site supported by yt-dlp                         |
| Instagram   | Photos, carousel items and pre-merged video from a post or reel |
| Torrent     | A public HTTP/HTTPS `.torrent` URL or uploaded `.torrent` file  |
| Magnet      | A BitTorrent v1 magnet link with a valid info hash              |
| File        | The response bytes from a direct public HTTP/HTTPS URL          |

YouTube, Vimeo, TikTok, Dailymotion, Twitch, Facebook, X/Twitter, Reddit and Bilibili domains are automatically
recognized. Use **Video** for other yt-dlp-supported sites. Platform support can change upstream; an extractor being
available does not guarantee access to every post. Private, removed, region-restricted, account-restricted or
DRM-protected media may not be available. No DRM bypass is implemented.

Video quality defaults to up to **1080p**. Select 360p, 480p, 720p, 1080p, 1440p, 2160p/4K or best available. Existing
video/audio streams are selected and merged without re-encoding. When separate streams need merging, the container can
be MKV; the final filename reports the actual extension. Audio-only sources may produce an audio file. Only one video is
requested; playlist expansion is disabled.

Instagram accepts individual `/p/`, `/reel/`, `/reels/` and `/tv/` links. Profiles, bulk account archives, stories and
highlights are not included in this workflow. Carousel items are saved as separate files. Pre-merged Instagram videos
avoid unnecessary processing; the quality selector applies to **Video** downloads, not Instagram's pre-merged formats.

### Login cookies for Instagram and video sites

Some sources require a signed-in session even for otherwise visible media. LinkDock does not ask for your social account
password. It optionally reads an owner-supplied **Netscape cookie file**. Session validity, account permissions, source
rate limits and source anti-bot behavior still apply; a cookie file cannot guarantee access.

1. Export your own session to Netscape cookie-file format using a trusted method.
2. Create `secrets/cookies.txt` beside `compose.yaml` and put the exported cookies there.
3. Allow the container's UID 1000 to read the file:

   ```bash
   sudo chown 1000:1000 secrets/cookies.txt
   sudo chmod 600 secrets/cookies.txt
   ```

4. Start with the included optional mount:

   ```bash
   docker compose -f compose.yaml -f compose.cookies.yaml up -d --build
   ```

The optional configuration mounts the existing host file **read-only** at `/run/linkdock/cookies.txt` and sets
`MEDIA_COOKIES_FILE`. It refuses to create a missing host file. Keep using both Compose files when recreating this
service. With your own configuration, set `MEDIA_COOKIES_FILE` to the path inside the container, not the host path.

Cookies are copied into a private per-job session directory because tools may update their jar on exit. The mounted
original is never changed. Session copies stay outside downloadable output, use owner-only permissions, and are removed
when the job ends. Leftover session copies are removed on the next startup. `secrets/` is excluded from both source
control and the Docker build context. Do not store your master cookie file in LinkDock's managed `credentials/session-*`
directories.

To refresh cookies, replace the contents of the host file while preserving its permissions, then retry the failed job.
Restart the container if you replace the host file itself and Docker's bind mount still refers to the old file.

### Torrents and magnet links

The application starts one private aria2 child lazily when a torrent is first submitted. Its authenticated JSON-RPC
listener binds to loopback only on port 6800 and is **not** published. A fresh RPC secret is generated per service
process. Queue slots are shared by file, media and torrent transfers, so the configured concurrency applies across all
sources.

Magnets first fetch metadata and then follow aria2's new content GID. The interface shows metadata/peer stages, peer
count, received bytes and speed. Torrents require reachable peers and trackers; a magnet without available metadata
peers can time out. Incoming peer and DHT traffic uses TCP/UDP 6881, published by Compose. `TORRENT_PORT` changes the
host mapping; keeping the same port end-to-end is simplest when configuring your router. Port forwarding is optional for
many swarms but can improve reachability. Do not forward the private RPC port.

BitTorrent v1 and conventional hybrid torrents with v1 hashes are the target. Pure BitTorrent v2 magnets are rejected
with a validation message. Magnet links must contain a valid `urn:btih:` topic. A `.torrent` file is limited to **2
MiB**, then aria2 validates its bencoded contents. Remote metadata is fetched through the direct downloader's
public-address checks before being handed to the engine.

Peer upload can occur while downloading. **Post-completion seeding is disabled** so completed jobs release their queue
slot. There is no ratio configuration. New jobs retrieve metadata and pause for explicit file selection before payload
transfer. Pause retains private data and aria2 control files; Resume reapplies the approved selection and reuses
verified pieces. Retrieved magnet metadata is pinned locally for subsequent resumes. Remote torrent metadata is pinned
on first fetch so a changing URL cannot mix another torrent into resumed staging. Restart clears that remote metadata
snapshot as well as partial data; uploaded metadata stays attached to its job. Cancellation removes the job's active
GIDs and partial output; Restart begins again. Only selected files are published for new jobs. Legacy jobs keep their
existing all-files behavior. Completed jobs provide individual save links and a streamed **Save all as ZIP** action for
multi-file output.

### Network and resource limits

Direct files and media source URLs use HTTP/HTTPS on standard ports. Direct file redirects and media proxy destinations
are checked against private/local/reserved addresses and use pinned DNS results. Embedded URL credentials and custom
source ports are rejected. Video and Instagram tools receive a loopback-only checked egress proxy; arbitrary subprocess
arguments and shell command text are never accepted from the browser.

Torrent peer, DHT, tracker and webseed networking is managed by aria2 and does **not** inherit the media proxy's
public-address filter. Use torrent metadata you trust and restrict the container's network externally if you need an
enforceable egress policy. aria2 handles torrent path normalization; published file manifests additionally exclude
symlinks, enforce real-path containment and limit directory depth. Run one station process per data directory.

The default ceiling is **20 GiB per complete job**, including the sum of a carousel or torrent's files. Direct streams
enforce this per chunk. Torrent totals are checked through RPC polling; media staging is checked periodically, with up
to twice the job ceiling allowed for temporary audio/video merge files. Periodic checks can overshoot between samples;
these are application guards, not kernel filesystem quotas. Successful final output must still fit the configured total.
Leave room for merge duplication and other applications; use a host filesystem quota if a hard disk-space ceiling is
required.

History retains at most 500 jobs; each file set supports at most 2,000 files and 32 levels of directories. Cancel and
Restart discard progress. Queued and manually paused jobs survive restarts; interrupted active jobs automatically
requeue. Startup retains partial files and staging for queued/paused records, removes orphaned progress and clears
temporary cookie sessions. Complete files stay until explicitly deleted.

## Storage, USB drives and backups

Compose creates a named volume mounted at `/data`. It contains:

| Path                            | Responsibility                                        |
| ------------------------------- | ----------------------------------------------------- |
| `/data/settings.json`           | Owner speed, schedule and free-space preferences      |
| `/data/history.json`            | Queue, original links, states and completed manifests |
| `/data/downloads/<uuid>`        | Complete direct-file bytes, including v1 downloads    |
| `/data/downloads/<uuid>.part`   | In-progress direct file                               |
| `/data/downloads/<uuid>.work/`  | Isolated media or torrent staging                     |
| `/data/downloads/<uuid>.files/` | Complete media, carousel or torrent file set          |
| `/data/torrents/<uuid>.torrent` | Uploaded or pinned remote torrent metadata            |
| `/data/aria2/`                  | DHT routing state                                     |
| `/data/credentials/session-*/`  | Private temporary cookie copies, never served         |

History is atomically replaced on lifecycle changes. Progress remains in memory while streaming, avoiding continuous
SD-card writes. Partial downloads are retained for recoverable jobs. Atomic rename protects against torn JSON writes,
but this is not a transactional database or a guarantee against hardware power loss. Use one service instance per data
directory. Invalid history causes startup to fail instead of silently resetting your queue.

To use a USB SSD instead, stop the service and replace the service's volume entry in `compose.yaml`:

```yaml
volumes:
  - /mnt/ssd/linkdock:/data
```

Create that directory and give the container's unprivileged UID 1000 ownership:

```bash
sudo mkdir -p /mnt/ssd/linkdock
sudo chown 1000:1000 /mnt/ssd/linkdock
docker compose up -d
```

This starts with that directory's contents. To migrate existing files, stop the old service and copy **all** of `/data`,
including history, metadata and every download directory, before restarting. Ensure the SSD is mounted before starting
Docker. Storage statistics describe the entire filesystem containing `/data`, including files created by other
applications.

To make a coherent backup with either storage arrangement:

```bash
docker compose stop linkdock
docker compose cp linkdock:/data ./linkdock-backup
docker compose start linkdock
```

Protect backups: history includes original URLs, which can contain access tokens in their query strings. Store `.env`
separately and keep its permissions private. For restore, stop LinkDock, replace the complete data directory from the
backup, restore ownership to UID 1000 and restart. Include `settings.json` and the private `notifications` directory.
Never combine history from one backup with files from another.

`docker compose down` keeps the volume. **Do not use `docker compose down -v` unless you intend to erase all stored
files.**

## Operation and network access

```bash
docker compose logs -f --tail=100 linkdock
docker compose restart linkdock
docker compose down
docker compose up -d --build
```

To update, retain `.env` and the data volume, copy in the new source, back up data and run
`docker compose up -d --build`. The container runs as an unprivileged user with a read-only root filesystem, dropped
capabilities and a writable data volume. Logs rotate. The health check probes `/api/health`; it confirms service
responsiveness, not source availability or queue writability. Compose's restart policy restarts exited processes, not
merely unhealthy ones.

The default published port is reachable through the Pi's network interfaces. Use this on your trusted LAN, or restrict
access through a VPN. For remote access, configure an HTTPS reverse proxy, preserve the host header and set:

```dotenv
SECURE_COOKIE=true
PUBLIC_ORIGIN=https://downloads.example.com
```

Use the exact origin without a trailing slash. Restrict direct access to the backend port when a proxy provides the
public entry point. For a proxy on the same host, bind the Compose port to loopback, for example `127.0.0.1:8080:8080`.
Configure the proxy separately; this project does not provision certificates or DNS. HTTP on your LAN requires
`SECURE_COOKIE=false`.

The station password authorizes all queue and file operations. There are no user accounts or per-person permissions.
Sessions expire after 12 hours; rotate the password and recreate the container to invalidate every session. Locking one
browser clears its cookie but does not cancel transfers or revoke copied cookies. Passwords are never saved in frontend
storage or bundled into frontend assets. Logs record static lifecycle messages and error classes, not submitted
passwords or source links.

## Environment reference

Copy `.env.example` to `.env`; every supported application variable is documented there. Environment values are read
only in `server/config.ts`, validated at startup and passed to the service modules. No frontend environment secrets
exist.

| Variable                   | Default                  | Purpose                             |
| -------------------------- | ------------------------ | ----------------------------------- |
| `LINKDOCK_ACCESS_TOKEN`    | Required, 32+ characters | Password and session signing secret |
| `PORT`                     | `8080`                   | Host port; local service port       |
| `MAX_CONCURRENT_DOWNLOADS` | `2`, range 1–8           | Concurrent jobs                     |
| `MAX_FILE_SIZE_GIB`        | `20`, range 1–65535      | Per-job ceiling in GiB              |
| `SECURE_COOKIE`            | `false`                  | Enable for HTTPS access             |
| `PUBLIC_ORIGIN`            | Unset                    | Exact external browser origin       |
| `WEB_PUSH_SUBJECT`         | Unset                    | Optional mailto/HTTPS push contact  |
| `DATA_DIRECTORY`           | `./data` locally         | Compose fixes this at `/data`       |
| `MEDIA_COOKIES_FILE`       | Unset                    | Cookie path inside container        |
| `TORRENT_PORT`             | `6881`                   | Host TCP/UDP peer port              |
| `NODE_ENV`                 | Docker: `production`     | Serve frontend from the backend     |

Changes to `.env` require `docker compose up -d` to recreate the service when its environment changes. A plain container
restart does not reread Compose's `.env` file.

## Local development

For actual media/torrent work outside Docker, install Python 3.10+, ffmpeg and aria2, create a Python virtual
environment and install `requirements-media.txt` into it. Activate that environment before `pnpm dev` so `yt-dlp` and
`gallery-dl` are on the service PATH. Direct-file development and mocked tests do not require the external executables.
Docker is the documented complete deployment path and includes the media engines plus the JavaScript challenge solver
used by YouTube.

Use Node **24.19.0** and pnpm **12.14.0**. `.nvmrc`, `engines` and `packageManager` record these choices. Install the
pinned pnpm through Corepack on a Node installation that provides it:

```bash
corepack enable
corepack prepare pnpm@12.14.0 --activate
pnpm --version
cp .env.example .env
```

Set a private station password in `.env`, then:

```bash
pnpm install
pnpm dev
```

Vite serves the frontend on port 5173 and proxies `/api` to the backend on port 8080. The backend watches TypeScript
files. If you change the backend's local `PORT`, update the proxy target in `vite.config.ts` to match. Both development
servers bind network interfaces, so use a trusted development network. Authentication is required during development
too.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:run
pnpm format
pnpm format:check
pnpm build
```

`pnpm test` watches; `pnpm test:run` is the deterministic non-watching suite. Build type-checks both runtimes, builds
frontend assets into `dist` and emits server JavaScript into `dist-server`.

To preview the frontend build, run `pnpm dev:server` in one terminal and `pnpm preview` in another. Preview proxies the
API to the backend; it does not execute downloads itself. For an integrated local production run:

```bash
pnpm build
NODE_ENV=production pnpm start
```

`pnpm start` reads `.env` if present. Docker receives environment variables from Compose instead and does not copy
`.env` into the image.

## Stack and architecture

| Tool                                     | Purpose                                                          |
| ---------------------------------------- | ---------------------------------------------------------------- |
| React + React DOM                        | Accessible interactive dashboard and local view state            |
| TypeScript                               | Strict contracts across browser, API and backend                 |
| Vite                                     | Development proxy and production asset build                     |
| Plain CSS with shared tokens             | Responsive design without a runtime styling dependency           |
| Express                                  | Small authenticated HTTP boundary and production static files    |
| yt-dlp + packaged EJS solver             | Site video extraction and structured progress                    |
| gallery-dl                               | Instagram images, carousels and pre-merged videos                |
| ffmpeg                                   | Merge separate video/audio streams without re-encoding           |
| aria2                                    | BitTorrent metadata, peer transfers and private JSON-RPC         |
| Native Node HTTP, streams and filesystem | Pinned-DNS downloads, backpressure and persistent files          |
| ipaddr.js                                | IPv4/IPv6 address classification for public-destination checks   |
| yazl                                     | Lazy streaming ZIP/ZIP64 with stored entries                     |
| web-push                                 | Maintained Web Push encryption and VAPID signing                 |
| Helmet + express-rate-limit              | Response hardening and login attempt limits                      |
| Vitest + Testing Library + Supertest     | Business rules, user interactions and real HTTP boundary tests   |
| Oxlint + narrow ESLint fallback          | Requested code-quality rules, including unsupported Oxlint rules |
| Prettier + convention script             | Formatting, source line limit and component size checks          |
| tsx + concurrently                       | Local TypeScript watching and two-server development             |

The application has one screen; React Router and a global state library would add no useful behavior. The UI has no mock
queue entries or invented storage numbers. `App` composes feature components. `useDownloads` owns API snapshots,
polling, authentication expiry and mutation state. Forms own temporary input errors. Filters and search stay local to
the list.

Flow: source form → typed API → authenticated route → shared queue → selected engine → isolated files and manifest. The
browser polls every 1.5 seconds without overlapping scheduled polls. Refresh after a mutation gives immediate feedback.
A transient connection error retains the previous snapshot and retries; an expired session clears the snapshot and shows
the password gate. The native browser file action streams the response directly to the browser's download manager using
the HttpOnly cookie, avoiding an in-memory browser Blob for a multi-gigabyte file.

The theme uses a non-sensitive local preference key; no credentials are saved there. Only fixed public reconnect assets
and icons enter the service-worker cache. Queue execution and progress belong to the server, not a browser tab. The
session cookie is global browser authentication state; the password is held only by the submitted form until
authentication.

### Directory responsibilities

- `src/app`: application composition, root error boundary and entry-level behavior.
- `src/components/layout`: shared station rail and connection header.
- `src/components/ui`: decorative SVG icon system.
- `src/features/downloads/components`: composer, metrics, filters and transfer controls.
- `src/features/downloads/hooks`: polling and queue mutations.
- `src/features/downloads/services`: same-origin typed API boundary.
- `src/features/downloads/utils`: pure formatting and view membership helpers.
- `src/features/session`: password form, independent of queue internals.
- `src/features/theme`: saved dark/light appearance and theme controls.
- `src/features/mobile`: optional installation, reviewed share drafts and device-scoped alerts.
- `src/features/settings`: station policy drafts, limits and daily-window controls.
- `src/lib/api`: authenticated JSON requests shared across features.
- `src/features/health`: lazy diagnostic disclosure, real measurements and engine recovery guidance.
- `src/lib/format`: binary size formatting shared across the collection and health views.
- `src/lib/logger`: sole permitted console access, without sensitive request data.
- `src/styles`: design tokens, dashboard styles and responsive breakpoints.
- `shared`: serializable contracts and shared endpoint/status/method constants.
- `server/security`: signed sessions, URL validation and public DNS resolution.
- `server/downloads`: queue, persistence, filesystem naming, HTTP streams and routes.
- `server/engines`: checked media proxy, bounded subprocesses, credentials, manifests and torrent RPC.
- `server/policy`: validated persistent preferences, daily windows and free-space checks.
- `server/notifications`: durable bounded outbox, retry classification and private registrations, signing identity and
  bounded encrypted delivery.
- `server/downloads/bulkLibrary.ts`: bounded whole-selection preflight, atomic labels and per-record deletion outcomes.
- `server/downloads/delivery`: checked media streams, byte ranges, portable ZIP exports and resource leases.
- `server/health`: independent bounded system sampling, fixed thermal readers and lazy, bounded and cached command
  checks plus private process/storage diagnostics.
- `server/config.ts`: the sole environment reader.
- `tests`: behavior and integration tests with isolated temporary state.
- `scripts`: complementary code-convention validation.

Components import feature-local helpers directly. A feature must not reach into another feature's internals. If
cross-feature reuse becomes necessary, expose a deliberate public entry point or move truly shared behavior to a shared
directory. No empty architecture folders or barrels are included just to match a template.

## Coding conventions

TypeScript is strict in both runtimes, including unused locals/parameters, null checks, unchecked indexed access and
implicit override checks. Avoid `any`, ignored compiler errors and type assertions that bypass validation at trust
boundaries. Use descriptive camelCase variables and verb-led function names, PascalCase components/types, `is`/`has`
boolean prefixes and `on` callback props. Components use PascalCase files; hooks use `useSomething.ts`; helpers use
camelCase files.

Every React component source file must remain at or below **100 lines**, including imports, types and documentation.
Extract stateful logic to a feature hook, pure calculations to a utility, and a clearly separate visual responsibility
to a child. Do not create wrappers just to move a few lines. Keep component props on their own declaration lines,
destructure props and pass every multiline JSX attribute on its own line. Never spread JSX props or use array indices as
keys.

Document named functions and methods with JSDoc: describe their purpose, type each `@param` in braces, and describe
returned values with `@returns`. Document every component prop using dotted parameter names in interface order. Simple
inline expression callbacks do not need redundant documentation. For example:

```ts
/**
 * Converts a received byte count into a compact binary size for the queue.
 * @param {number | null} bytes - Received size, or null for an unknown total.
 * @returns {string} Readable size with its unit.
 */
```

Use explicit braces, explicit coercions and an explicit `Fragment` only when a fragment is needed. Keep imports near
their consumer and use `import type` for type-only dependencies. Unexpected render errors go through the root error
boundary; request failures become inline messages, with developer diagnostics through `src/lib/logger`. Never log tokens
or signed source URLs.

### Constants policy

Operational values belong in named constants close to the feature. `server/constants.ts` names transfer limits with
units; `shared/contracts.ts` defines endpoints, states and request methods; download display constants live in the
feature. Fixed states use `as const` objects with derived unions, for example:

```ts
const TRANSFER_STATE = { waiting: 'waiting', finished: 'finished' } as const;
type TransferState = (typeof TRANSFER_STATE)[keyof typeof TRANSFER_STATE];
```

Use unit-bearing names for timeouts and byte limits. Extract meaningful numbers except obvious 0, 1 and -1. A constant's
own literal value is its definition. Single-use, self-explanatory labels, HTML attributes, CSS class names and
descriptive errors may remain inline. Extract reused visible messages and do not repeat raw endpoint, storage-key, event
or status comparisons. CSS declares design values and breakpoints in their styling context; it is not application
business logic.

### Lint and format

Oxlint is the primary linter. `--deny-warnings` and ESLint's `--max-warnings 0` make any warning fail `pnpm lint`. The
original rule severities are preserved. Required plugins are explicitly enabled; JSX filename extensions are corrected
to `.tsx`. Only `src/lib/logger/**` may use console. Native `no-magic-numbers` is enabled at error severity. It ignores
obvious 0, 1 and -1 and array indices, and requires constants for nontrivial values.

Oxlint 1.88 rejects these five requested rule names, so their exact original values live in `unsupported-rules.json` and
are enforced by the narrow `eslint.config.js` fallback:

- `camelcase`
- `react/no-unused-class-component-methods`
- `react/no-deprecated`
- `react/destructuring-assignment`
- `react/forbid-foreign-prop-types`

They cannot remain in `.oxlintrc.json` because Oxlint refuses to run with unrecognized rule names. See `VALIDATION.md`
for the complete resolution and compiler-version exception. ESLint 9 is the latest major accepted by this React plugin's
published peer dependency. No blanket source-rule disabling comments are used.

Prettier uses `printWidth: 120` and `singleAttributePerLine: true`. Print width is a target, so `checkConventions.mjs`
also checks the hard 120-character source limit and 100-line component limit. It checks JSDoc presence and typed
parameters on named declarations and methods. Prop documentation and magic strings still need reviewer judgment; no lint
claim is made that string semantics can be reliably enforced automatically. The generated lockfile is exempt from
authored line limits.

## Adding a feature

1. Define the user-facing behavior, validation and failure states before choosing dependencies.
2. Create `src/features/<feature>` with only the component, hook, service or utility directories it actually needs.
3. Place serializable shared API contracts in `shared` if both runtimes use them. Keep endpoint and state values
   centralized.
4. Put side effects and data fetching in the feature's service/hook. Keep view state near the component that owns it.
5. Add authenticated backend routes for server behavior; validate input before acting on files or the network.
6. Test the meaningful user interaction, business rule and failure behavior. Avoid mirroring implementation details.
7. Compose the feature in `App`, update this README and run every validation command.

## Adding a component

1. Identify one responsibility and check whether an existing component already owns it.
2. Create a PascalCase `.tsx` file in its feature; use a neighboring `.types.ts` when that improves readability or size.
3. Document props and returns, destructure props and pass JSX attributes explicitly.
4. Use semantic native controls and associated labels. Include pending, error and empty states where relevant.
5. Extract a hook when stateful behavior obscures presentation; share it globally only after genuine cross-feature
   reuse.
6. Test observable behavior when the component has interactions or nontrivial conditional logic.
7. Run formatting and `pnpm lint` to confirm the size target before committing.

## Upgrading from an earlier LinkDock release

Keep the same data volume and `.env`, back up the volume, replace the source and rebuild:

```bash
docker compose up -d --build
```

Legacy direct jobs and their UUID files remain valid; the new optional source/manifest fields preserve the old history
format. Do not replace your volume with an empty directory. The new image installs additional system tools; rebuilding
is required, not just restarting the old image. An old page already open in a browser should be reloaded after
upgrading. Version 2.2 introduces a default 1 GiB free-space buffer; change it in Station controls if needed. Backups
must include `settings.json` as well as the existing history and files. Older versions cannot read paused states;
restore a complete pre-upgrade backup if you need to downgrade. Version 2.10 adds quality values that older servers
cannot validate and a private utility-state directory; preserve that directory with app state. Version 2.3 adds optional
priority fields and a private notification directory; preserve that identity and its registrations when upgrading.
Version 2.4 adds optional library metadata in history and read-only diagnostics. Version 2.5 adds media/ZIP routes;
version 2.6 adds bulk operations without new deployment variables, dependencies or persisted-history fields. Version 2.7
adds an optional private notification outbox; keep the complete notification directory. Version 2.8 adds private system
readings and an optional read-only temperature override; retain that override in Compose commands if enabled.
Downgrading to 2.6 will not drain the new backlog. Version 2.9 adds optional torrent selection, payload-publication and
destination fields plus `controls.json`. Preserve that file and the complete completion storage alongside `/data`. Keep
any `compose.destinations.yaml` override when recreating the service; moved files stay on that mount. Avoid downgrading
after moving files: older versions do not resolve completion destinations or honor the new file-selection state. Restore
both data and completion storage from a matching pre-upgrade backup if a downgrade is necessary. Older releases do not
display organization. HTTPS alert setup is opt-in.

Media sites change frequently. Use the utility updater for compatible stable extractor/aria2 updates. To change the
packaged fallback, update its explicit version in `requirements-media.txt`, rebuild with
`docker compose build --pull --no-cache` and recreate the service. Review engine release notes and test a small download
after updating. The EJS solver is installed by yt-dlp's default extra; remote component fetching is disabled. Packaged
ffmpeg and aria2 come from the base distribution repository. Managed aria2 uses compatible packages from those same
signed image repositories. Engine Python packages use their ecosystem installer inside Docker; JavaScript packages
remain managed exclusively by pnpm.

Dark mode is the initial appearance. The sun/moon control switches the complete palette and saves the choice in your
browser.

## Testing and verification

Tests cover source detection, magnet validation, media argument construction, cookie isolation, subprocess cancellation,
torrent metadata handoff and quota cleanup, theme persistence, artifact containment, public/private IP validation, mixed
DNS answers, filenames, real HTTP transport with pinned test DNS, redirects, streaming completion, unknown-length
limits, cancellation, concurrency, retry, restart recovery, cookie authentication, CSRF, invalid links, form errors,
deletion confirmation and formatting. Version 2.3 also tests atomic batches, duplicate review, priority persistence,
shared-link review, encrypted push transport, registration expiry and public-only worker caching. Version 2.6 checks
whole-selection label rollback, explicit deletion review, partial I/O failures and polling-safe bounded selection. HTTP
upstreams are local test servers or deterministic streams; tests do not depend on a public download service. Test state
is isolated and removed after each case.

Before a pull request:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:run
pnpm build
pnpm test:production
```

The production smoke check requires the build first and runs under native Node without the test transformer.

Manually check the password screen and queue at narrow phone, tablet and wide desktop widths. Verify focus visibility
and keyboard-only form submission. Test a real small public file on your Pi, then restart while downloading and confirm
work requeues automatically, or stays paused if you paused it. Confirm that retained direct bytes append only when the
source supports a stable validator and range response. Development tests do not certify an ARM64 container build or a
specific Pi's storage setup. On HTTPS, also verify installation/share behavior and test, disable and re-enable
notifications on each target browser; check that the offline page contains no private state.

Use focused branches and descriptive commits such as `feat: add queue filter` or `fix: reject private redirect`. Commit
the lockfile with dependency changes. Keep unrelated refactors out of a behavior change.

### Pull request checklist

- [ ] Behavior and meaningful failure paths work; appropriate tests pass.
- [ ] `pnpm lint` has zero errors and zero warnings; type checking and production build pass.
- [ ] Formatting passes, authored lines are within 120 characters and component files are within 100 lines.
- [ ] Named functions, returns and every component prop have useful typed JSDoc.
- [ ] Names are descriptive; meaningful numbers and repeated behavioral strings are constants or unions.
- [ ] No ignored errors, dead code, unnecessary dependencies, secrets or placeholders were introduced.
- [ ] Controls have labels, focus is visible, keyboard access works and layouts adapt to narrow screens.
- [ ] Loading, error, empty, connectivity and session-expiry states are considered.
- [ ] README, environment example and validation notes match the actual implementation.

## Troubleshooting

| Symptom                  | Action                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| Immediate exit           | Check password length, numeric settings and volume permissions.        |
| Station unreachable      | Check service status, Pi IP, published port and network.               |
| Session disappears       | Use `SECURE_COOKIE=false` for HTTP; check proxy and origin.            |
| Origin rejected          | Match `PUBLIC_ORIGIN` exactly, including ports; omit trailing slashes. |
| Private host blocked     | Use a public direct host on a standard HTTP/HTTPS port.                |
| Source HTTP error        | Check link expiry and source authentication requirements.              |
| Webpage downloaded       | Use the actual direct file URL instead of its landing page.            |
| Unknown size             | The source omitted length; actual-byte limits still apply.             |
| Interrupted transfer     | Recovered work requeues; manually paused work waits for Resume.        |
| Disk or permission error | Check space, mount presence and UID 1000 ownership.                    |
| Completed file missing   | Restore a backup or delete its record and add the URL again.           |
| Native compiler crash    | The TypeScript 6 pin avoids an unavailable native-runtime path.        |
| Development API fails    | Check `.env`, the backend port and Vite's proxy target.                |
| Pi build killed          | Free memory or build ARM64 on another Docker/Buildx host.              |

Third-party engine references: [yt-dlp](https://github.com/yt-dlp/yt-dlp),
[gallery-dl](https://github.com/mikf/gallery-dl), [aria2](https://aria2.github.io/) and [ffmpeg](https://ffmpeg.org/).
Their own licenses and notices apply to those installed tools.
