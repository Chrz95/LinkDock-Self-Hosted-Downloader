# Run LinkDock 2.9 on your Raspberry Pi

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

On a phone or tablet, open the same station address while connected to that network. Phone shortcuts lead to Overview,
Add link and Library. The layout uses larger touch controls, a full-width composer/search and stacked file actions. The
website needs no installation. HTTPS enables optional installation, supported share menus and browser alerts.

For USB storage, backups, HTTPS, configuration, development and troubleshooting, see `README.md`. For checks and
requirement adjustments, see `VALIDATION.md`.

## New in version 2

- Choose Video for YouTube and other supported sites; choose 720p, 1080p or best available quality.
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
- Open **On this device → Alert delivery · all registered devices** for private aggregate counts, refresh and an
  explicit **Clear pending alerts** action. Clearing does not disable registrations or recall requests already sending.
- Explicit test alerts remain immediate and do not retry automatically. Alerts are best effort: duplicates or missed
  events remain possible around crashes or storage failures, and provider acceptance does not prove device display.

Keep `.env` and the full data volume, including `/data/notifications`, then run `docker compose up -d --build` and
reload this page. No new dependencies or configuration variables are required. Malformed/unwritable backlog state
suspends background alerts while downloads continue; check station storage and follow the recovery steps in `README.md`.
Real-provider delivery and physical Pi/mobile acceptance remain deployment checks.

## New in version 2.8

- Open **Station health → System view** for OS-visible CPU threads, 1/5/15-minute load, uptime and total/free memory.
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
