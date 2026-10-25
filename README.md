# LinkDock

### Your downloads. Your Raspberry Pi. One place.

A self-hosted download station for videos, audio, galleries, torrents and everyday files. Queue a link from your phone
or browser, let your Pi do the work, and return to an organized download library.

**Docker deployment · Mobile-friendly interface · Dark & light themes · Browser companion**

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Q1J229F1AG)

[Features](#what-you-can-do) · [Supported sources](#supported-sources) ·
[Quick start](#quick-start-raspberry-pi--docker) · [Browser companion](#send-downloads-from-your-browser) ·
[Operations guide](OPERATIONS.md)

## A download station that keeps working

LinkDock runs downloads on your server, so closing your browser does not stop the queue. Its responsive workspace
separates active transfers, your download library and settings, with progress, queue controls and saved preferences
available from a phone, tablet or desktop.

## What you can do

| Capability                   | What you get                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Video downloads**          | Download from YouTube and other supported platforms. Choose best available or a resolution ceiling from 360p to 4K.   |
| **MP3 audio**                | Extract audio from supported videos at a target 128, 192 or 320 kbps.                                                 |
| **Torrents & magnets**       | Add a torrent URL, upload a `.torrent` file or paste a magnet. Select individual files after metadata is available.   |
| **Instagram collections**    | Save photos, videos and carousel items from supported post and reel links.                                            |
| **DeviantArt collections**   | Save supported artwork, literature, videos and galleries, with optional account authorization and browser sessions.   |
| **Direct files**             | Download files from public HTTP and HTTPS links.                                                                      |
| **Queue management**         | Pause, resume, cancel, restart, prioritize and review batches before adding them.                                     |
| **An organized library**     | Search and filter downloads, add tags and favorites, browse multi-file collections and use bulk actions.              |
| **Preview & export**         | Preview supported saved media, download individual files or export a multi-file job as a ZIP.                         |
| **Automatic file placement** | Save a global completed-folder preference and move finished downloads to mounted storage.                             |
| **Unattended operation**     | Set daily download windows, speed limits and a free-space buffer. Schedule pause/resume actions from the terminal.    |
| **Utility maintenance**      | Update yt-dlp, gallery-dl and compatible aria2 packages from Settings, with verified activation and recovery options. |

### Built for everyday use

- **Dark by default, light when you prefer.** Your browser remembers your theme.
- **Phone-ready controls.** Manage transfers from another device on your network.
- **Persistent state.** Manually paused jobs stay paused; interrupted active jobs requeue after a restart.
- **Station health.** Inspect storage, queue state, tool versions and available system readings.
- **Optional device features.** Installation, share handling and encrypted browser alerts are available where your
  browser and deployment support them. Installation and alerts require HTTPS or a supported secure context.
- **Password-protected access.** Sign in before managing downloads or accessing saved files.

## Supported sources

| Source                        | Supported workflow                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **YouTube & video platforms** | Individual videos through yt-dlp, including recognized Vimeo, TikTok, Dailymotion, Twitch, Facebook, X/Twitter, Reddit and Bilibili links. |
| **Other video sites**         | Choose **Video** for additional yt-dlp-supported sites, including Pornhub. Availability depends on the extractor and source access.        |
| **Instagram**                 | Individual posts, reels and carousels. Account sessions may be required.                                                                   |
| **DeviantArt**                | Individual items and supported gallery/collection links through gallery-dl. Some content requires OAuth, a browser session or both.        |
| **BitTorrent**                | Torrent files, public torrent URLs and BitTorrent v1 magnet links.                                                                         |
| **Public file hosts**         | Direct HTTP/HTTPS file URLs. For landing pages with timers, complete the steps in your browser and submit the resulting file link.         |

Quality follows the formats offered by the source; selecting 4K does not upscale a lower-resolution video. MP3
conversion cannot restore detail absent from the original audio. Video playlist expansion is disabled. Instagram profile
archives, stories and highlights are not included in the Instagram workflow.

Source support changes over time. Private, deleted, region-restricted or subscription-only content may remain
unavailable. LinkDock does not bypass DRM, paywalls or CAPTCHAs. Browser verification must be completed by you, and some
browser-bound checks cannot be transferred to a server. Torrent peer upload can occur during a download; post-completion
seeding is disabled.

## Quick start: Raspberry Pi + Docker

Use a 64-bit Raspberry Pi OS installation with Docker and the Docker Compose plugin. Run these commands from the project
directory containing `compose.rpi.yaml`. The supplied configuration builds the image locally and uses host folders for
application state and downloads.

### 1. Prepare your storage

This example stores state in `/home/pi/configs/linkDock` and downloads in `/home/pi/downloads/linkDock`. Change the
download location to your mounted disk if preferred.

```sh
sudo install -d -o 1000 -g 1000 -m 0750 \
  /home/pi/configs/linkDock \
  /home/pi/downloads/linkDock/transfers \
  /home/pi/downloads/linkDock/completed
```

The container runs as UID/GID **1000:1000**. Existing folders and files must also be writable by that user. The
bind-mount directories must exist before startup.

### 2. Configure your station

For a new installation, create `.env` with:

```dotenv
LINKDOCK_ACCESS_TOKEN=replace-with-a-random-password-of-at-least-32-characters
LINKDOCK_DOWNLOAD_PATH=/home/pi/downloads/linkDock
PORT=7489
SECURE_COOKIE=false
```

Generate a password with `openssl rand -hex 32` and replace the example value. Keep `.env` private and out of Git. For
an existing installation, edit your current `.env` rather than replacing it.

### 3. Build and launch

```sh
sudo docker compose -f compose.rpi.yaml up -d --build
```

Open **`http://YOUR_PI_IP:7489`** and sign in with your configured password. The application listens on port **8080
inside the container**; `PORT` selects the published host port.

### 4. Choose where completed files go

In **Settings → Download defaults → Completed downloads**, enable automatic moves and save the root or a subfolder. New
jobs inherit this preference, so you do not need to choose it for every download.

| Host directory                        | Container path    | Purpose                                                        |
| ------------------------------------- | ----------------- | -------------------------------------------------------------- |
| `/home/pi/configs/linkDock`           | `/data`           | History, preferences, saved sessions and managed tools.        |
| `${LINKDOCK_DOWNLOAD_PATH}/transfers` | `/data/downloads` | Transfer storage and files retained without an automatic move. |
| `${LINKDOCK_DOWNLOAD_PATH}/completed` | `/completed`      | Completed files when automatic moves are enabled.              |

Completed jobs use their own subdirectories. Use **Library → View files** to locate or save a specific output. To change
the state directory, edit its bind source in `compose.rpi.yaml`. Containers can write only to host locations that you
mount; entering an arbitrary Pi path in the interface does not mount it.

For HTTPS reverse proxies, alternative mounts, environment variables and backups, see the
[operations guide](OPERATIONS.md#operation-and-network-access).

## Send downloads from your browser

The included **LinkDock Browser Companion** lets you add the current page or paste a link without returning to the
composer. Choose the source, video quality or MP3 output directly in the popup.

1. Download the companion from **Settings → Browser sessions → Connect directly from your browser**.
2. Unzip it and install it using **Developer mode → Load unpacked** in desktop Chrome, Edge or Brave.
3. Open your LinkDock station, sign in and connect the companion to that trusted station.
4. Open the popup on a source page and choose **Add a download**.

Your signed-in station tab must remain open; it can stay in the background. The companion is supplied as an unpacked
extension, so installation requires your browser's approval.

### Connect account sessions without exporting cookie files

For Instagram and DeviantArt, the companion can send a session directly from your browser to your station. Sign in to
the source normally, choose **Connect a site session**, review the station address and approve the transfer. Multiple
site sessions are stored separately, so connecting one does not replace the other.

Adding a download does not read source cookies. Session sharing is a separate, explicit action, and the companion has no
background synchronization. Use HTTPS when transferring account sessions; HTTP sends them unencrypted across your
network. Mobile devices can use sessions sent from a desktop browser.

DeviantArt also has an in-app OAuth flow, including a manual return-URL step for HTTP-only LAN stations. See the
[companion guide](browser-connector/README.md) and
[DeviantArt account setup](OPERATIONS.md#optional-account-authorization).

## Control the queue from the terminal

The built-in CLI supports individual jobs, all downloads, file selection, completion destinations and scheduled
pause/resume actions. These examples use the bundled Raspberry Pi container name:

```sh
sudo docker exec link_dock node dist-server/server/cli.js list
sudo docker exec link_dock node dist-server/server/cli.js pause all
sudo docker exec link_dock node dist-server/server/cli.js resume all
sudo docker exec link_dock node dist-server/server/cli.js --help
```

See [terminal commands and schedules](OPERATIONS.md#terminal-commands-and-one-shot-schedules) for more examples.

## Keep your station up to date

Use **Settings → Download utilities** for automatic or manual engine updates. Updates wait for idle workers and verify
the candidate before activation; a failed attempt keeps the previous tools selected. Restore bundled tools or roll back
to a retained compatible release when needed.

Utility updates do **not** update LinkDock itself, ffmpeg or the container operating system. To update the application,
back up your state and download directories, replace the project source, then rebuild using your existing Compose file,
project settings and mounts:

```sh
sudo docker compose -f compose.rpi.yaml up -d --build
```

Version **2.29** includes verified curl-cffi browser support for video extractors. If a video fails because browser
support is missing, rebuild the current image and run the read-only diagnostic:

```sh
sudo sh scripts/checkVideoEngine.sh
```

See [upgrade notes](OPERATIONS.md#upgrading-from-an-earlier-linkdock-release) before changing versions.

## Built with

**React · TypeScript · Node.js · Docker**

Downloads are powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp), [gallery-dl](https://github.com/mikf/gallery-dl),
[aria2](https://aria2.github.io/) and [FFmpeg](https://ffmpeg.org/). These tools retain their own licenses and notices.

The container uses a non-root user, a read-only root filesystem and dropped Linux capabilities. Public-address checks
help protect against downloads targeting private network services. Keep the station on a trusted network or configure
HTTPS and appropriate access controls before making it remotely accessible.

## Documentation & development

- [Operations, configuration, troubleshooting and release history](OPERATIONS.md)
- [Browser Companion setup](browser-connector/README.md)
- [Validation notes and known testing limits](VALIDATION.md)
- [Local development](OPERATIONS.md#local-development)
- [Contribution checks and conventions](OPERATIONS.md#coding-conventions)

Use the Node and pnpm versions pinned in the project. Tests cover application behavior and integration, alongside
linting, type checking and production smoke checks. Source access and actual performance still depend on your Pi,
storage, network and the upstream site.

## Support LinkDock

If LinkDock makes your download setup easier, you can support its development on Ko-fi.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Q1J229F1AG)
