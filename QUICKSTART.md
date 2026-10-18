# Run LinkDock 2.5 on your Raspberry Pi

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
