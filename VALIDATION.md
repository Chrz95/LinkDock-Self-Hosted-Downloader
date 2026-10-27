# LinkDock 2.32 delivery and validation

Validated on 25 October 2026 using Node 24.22.1 and the committed dependency lockfile. The project pins pnpm 12.14.0;
this session's provided command wrapper reports 11.25.0. A fresh Docker/Pi toolchain build remains unverified. Version
2.3 adds `web-push` 3.6.7 and development types 3.6.4 for maintained encryption and VAPID signing; the application uses
its own bounded, public-DNS-pinned HTTPS transport rather than the package's buffered delivery transport. Existing
frontend and media-engine versions remain pinned by the committed manifests and lockfile.

## Version 2.32 changes: persistent automatic queue retries

Validated on 27 October 2026 using Node 24.22.1. All **719 tests across 89 files** passed, with the full run performed
without competing build/lint work. Type checking, lint, formatting, the production build and compiled production smoke
checks passed. Application dependencies and the lockfile are unchanged.

- Recognized transient direct-file/media failures get up to three delayed queue retries (30 seconds, 2 minutes, 5
  minutes). Waiting releases the slot. Direct HTTP 429 delays increase from 5 to 10 to 20 minutes, with valid provider
  Retry-After deadlines extending the wait. Seconds and all three HTTP-date forms are parsed without local-timezone
  dependence; negative/decimal delays, invalid dates and oversized headers are rejected rather than shortened.
- Queue tests exercise real streaming/storage with controlled transport: supported ETag/range continuation after a
  reset, cooldown isolation between hosts, bounded attempts and one final notification, persisted deadlines/budgets
  across restart, authoritative pause/cancel, opt-out at runtime/startup, unchanged active downloads on retry-only
  preference changes, and fail-closed behavior when a retry decision cannot be saved.
- Policy/HTTP tests cover fixed eligible types/codes, protected publication state, source DNS policy rejection, TLS and
  filesystem exclusions, malformed history fields, long/date Retry-After values, rate-limit review, legacy settings
  migration, omitted-field preservation and a real single-request deferred HTTP 429 without sleeping in the worker.
- UI tests verify scheduled, paused, recovered and exhausted retry explanations and the owner preference switch.
  Compiled production smoke checks restore durable retry metadata and apply the disabled-preference hold without
  contacting a provider.
- Source cooldowns apply to queued jobs sharing their original hostname, grouping YouTube aliases. Existing active
  workers are not interrupted by a source cooldown. Source timing, daily windows, storage/global/manual holds still
  apply. Purely local published-file moves bypass source cooldowns. Engine-internal retries remain separately bounded.
- Login, verification, access, DRM, TLS validation, private-address rejection, storage, unknown failures and torrent
  jobs do not enter automatic queue retries. Extractor rate-limit errors remain manual because their Retry-After header
  is not reliably available. Direct invalid Retry-After errors also remain reviewable rather than auto-retrying.
- Supported partial data survives between eligible automatic attempts. Direct append still requires the original strong
  ETag, exact final resource and matching range. Failed final attempts do not guarantee retained partial data; explicit
  Restart continues to discard partials and reset the retry budget while keeping an active source cooldown.
- Browser Companion 1.2 is retained. Live Pi/provider/VPN behavior, a fresh Docker image build and native browser
  installation remain unverified. No Chromium binary is installed here. This release does not add VPN routing changes.

## Version 2.31 changes: independent browser companion pairing

Validated on 27 October 2026 with Node 24.22.1. All **691 tests across 86 files** passed. Type checking, lint,
formatting, the production build and compiled production smoke checks also passed. Dependencies and lockfile are
unchanged. An initial full run hit two five-second timeouts in unchanged Settings form tests while other checks were
running; those tests passed alone, and the complete suite then passed without competing checks. No timeout was
increased.

- Browser Companion 1.2 pairs through the signed-in station's authenticated same-origin API. The resulting credential
  permits queue insertion and self-revocation only. Direct extension requests omit browser cookies, reject redirects,
  use the exact station origin/port and require the existing optional host permission.
- Native API tests verify cookie-free submission after station logout, owner-only pairing, website-origin rejection,
  extension-origin mismatch, CORS preflight, bearer scope, immediate owner/self-revocation, persistence, expiry, station
  password rotation, private hash-only storage, connection-count limits and refusal of corrupt or tampered state.
- Extension tests exercise the actual shipped scripts and independently serialize the pairing function. They cover
  closed station tabs, no source-cookie reads for downloads, removed permissions, fixed error messages, uncertain
  acknowledgements without retries, local forgetting with failed remote revocation and normal/incognito separation.
- Settings tests verify lazy loading, independent revocation, retained state after failure and view cancellation. A
  production smoke test runs the shipped extension's direct-fetch function against the compiled server without station
  cookies, then verifies denied library access and immediate self-revocation.
- The server retains only hashed credentials and station-specific signatures in bounded private state. Tokens expire
  after 90 days and become invalid when the station password changes. Local extension tokens are restricted to trusted
  extension contexts; browser local storage is shared between normal/incognito modes, with separate destination keys.
- Site-session sharing keeps its separate explicit confirmation and signed-in station-tab requirement. There are no new
  required browser permissions or background workers. Browser Companion 1.1 saved destinations keep tab mode until
  paired.
- Native browser installation, browser network-policy behavior, fresh Docker builds and live Pi deployment remain
  unverified in this environment. No Chromium binary is installed here. The NordVPN relay remains excluded, and the
  built-in diagnostics from 2.30 remain in place.

## Version 2.30 changes: built-in download diagnostics

Validated on 27 October 2026 with Node 24.22.1. All 675 tests across 83 files passed; the affected engine/route tests
also passed after adding command cancellation. Type checking, lint, formatting, production build and compiled smoke
checks passed. Application dependencies and lockfile are unchanged.

- Failed direct files, videos and galleries expose an explicit Test connection action. The authenticated JSON POST route
  accepts an existing job ID and never uses a client-supplied URL or executable argument.
- Real local HTTP fixture tests cover CloudFront 403 classification, successful pages containing incidental CAPTCHA
  text, redirect cookie isolation, private destination rejection, prefix limits and stalled DNS cancellation.
- API tests cover authentication, foreign-origin rejection, unsupported job states, report sanitization, unchanged
  job/session state, station-wide concurrency, cache expiry and expired/unrelated cookies. Engine tests inspect active
  managed command selection, usable versus unavailable browser targets, ffmpeg and gallery-only checks.
- UI tests cover explicit invocation, disabled duplicate clicks, session errors, retry, unmount cancellation and JSON
  export excluding the job URL and filename. A compiled production check exercises actual private DNS rejection and safe
  export through the new endpoint.
- Checks use the relevant worker DNS policy and pin every public destination, including redirects. Saved authorization
  is informational; OAuth is not refreshed and provider APIs/media files are not tested. The Node HTTP client differs
  from the media extractor, so a successful check does not guarantee a completed download.
- Browser visual verification was attempted but could not run because Chromium is not installed in this environment.
  Live Raspberry Pi deployment, NordVPN behavior, provider acceptance and a fresh Docker image build remain unverified.
  This release introduces no VPN routing changes; the previously excluded relay remains excluded.

## Version 2.29 changes: usable browser support for video engines

Validation: 660 tests across 79 files, lint, formatting, TypeScript/production build and native production smoke checks
passed. Node package pins and lockfile are unchanged. Local Node is 24.22.1; the Dockerfile retains Node 24.19.0. The
provided pnpm wrapper is 11.25.0; the project pin remains 12.14.0.

- The user's active yt-dlp 2026.10.21 reported all browser impersonation targets unavailable. Both bundled image and
  managed candidate installation used only the default extra. They now request `yt-dlp[default,curl-cffi]`. Bundled
  requirements pin yt-dlp 2026.10.21 and curl-cffi 0.14.0; gallery-dl remains 1.32.17.
- The same Python runtime check is used in Docker builds and managed candidates. It requires a Chrome target actually
  registered through curl_cffi, without fetching sources or reading account sessions. The asset is copied with compiled
  modules. A real environment reports 33 available targets; the same yt-dlp without the dependency correctly fails.
- A changed dependency-profile identity prevents older saved environments overriding the corrected image. The old
  release data is retained. Regression coverage verifies bundled fallback, safe updater snapshots, rejected candidates,
  unchanged activation pointers and candidate-directory cleanup. Existing rollback checks enforce the new identity.
- Real yt-dlp 2026.10.21/curl-cffi 0.14.0 requests passed through a local HTTP fixture proxy. HTTP and HTTPS redirects
  to private destinations stayed blocked by the actual compiled LinkDock guard, with zero private-origin requests.
  Ambient proxy and NO_PROXY variants are removed from media worker environments; parent environments are unchanged.
- Missing browser-support diagnostics and extraction failures produce fixed `VIDEO-BROWSER-MISSING`/`VIDEO-EXTRACT`
  messages without raw provider output or private URLs. More specific region, rate and account restrictions retain
  priority. Real subprocess and worker tests cover the new failure boundary and environment wiring.
- The complete pinned requirements resolved to binary wheels for Linux ARM64 CPython 3.11, including curl-cffi's
  manylinux ARM64 wheel. This verifies wheel availability, not execution on ARM64. The real local Python checks used
  AMD64 CPython 3.12. No Docker daemon or live Raspberry Pi was available for an image/runtime test.
- `scripts/checkVideoEngine.sh` was syntax-checked and run with sudo/Docker command fixtures against the real engine. It
  resolved the active tool, reported usable targets, rejected option-like container names, exposed no station password
  and created no application data. It uses only fixed metadata flags, not a source download or update.
- The supplied live Pornhub URL and its accessibility from the user's network remain unverified. This fixes the
  confirmed missing capability; it does not establish that all provider, account or network restrictions are resolved.
  The existing Browser Companion 1.1 and its assets are retained. NordVPN relay changes remain excluded.

## Version 2.28 changes: Browser Companion 1.1

Validation: 649 tests across 77 files, lint, formatting, TypeScript/production build and native production smoke checks
passed. Existing dependency pins and the lockfile are unchanged. The project still pins pnpm 12.14.0; the supplied
workspace wrapper is 11.25.0. Local Node is 24.22.1; the Dockerfile retains Node 24.19.0.

- Added the green/lime download mark as authored SVG and PNG icons at 16, 24, 32, 48, 64 and 128 pixels. The toolbar and
  extension-list manifests reference shipped raster assets. The icon was visually inspected and dimensions checked.
- Redesigned the popup around Add a download, an optional source/quality/MP3 section, a remembered station and a
  separately confirmed site-session section. Current-page and pasted HTTP/HTTPS/magnet links use the existing station
  API; no backend change is required for LinkDock 2.23+.
- Station pairing requests permission only for the selected host, verifies the signed-in station marker, and stores only
  origin, tab ID and browsing mode. Discovery filters exact origins/ports and normal/incognito mode; reopened station
  tabs are found without a browsing-history permission. A station tab must remain open and signed in.
- Download submission executes in the station's isolated world with same-origin credentials, JSON bodies, redirect
  rejection and bounded requests. Serialized functions are tested independently of popup closures. No source-cookie
  reads or source grants occur during download submission; no passwords or submitted link history are stored.
- Tests cover real queue insertion through authenticated API routes, magnet/video/MP3 payloads, unsupported inputs,
  destination navigation, revoked permission, wrong ports/modes, closed stations, ambiguous responses, fixed error
  messages, duplicate-click prevention, station forgetting and explicit session-sharing confirmation.
- Popup tests use the real HTML, DOM controls and shipped scripts with Chrome API fixtures. Actual installation,
  permission dialogs and extension execution in native Chrome/Edge/Brave remain unverified in this workspace. No
  Chromium binary or live Raspberry Pi was available; Docker/ARM builds and live source downloads remain unverified.
- The app-served companion ZIP contains 16 files. Manifest icons and all popup scripts were checked against their
  authored source bytes. Existing site-session serialization and private server persistence remain covered.
- This release was rebuilt from the uploaded 2.26 archive. Backend/shared sources and network settings match that
  archive byte for byte. The subsequent NordVPN relay changes are intentionally excluded.

## Version 2.26 changes

Validation: 611 tests across 74 files, lint, formatting, TypeScript/production build and native production smoke checks
passed.

- Typed non-public-DNS rejection preserves the real media failure instead of allowing misleading extraction errors.
- Opt-in media-only Cloudflare HTTPS DNS with a pinned public resolver IP, verified TLS, bounded JSON/timeouts, matching
  questions/CNAME chains, A/AAAA validation, all-address public checks and connection address pinning.
- Default OS DNS remains in effect unless explicitly configured; no system-DNS fallback on DoH failure.
- No private destination access is enabled. Invalid questions, truncated responses, redirects, excessive bodies,
  malformed data, NXDOMAIN and private/mixed addresses fail closed.
- Tests cover actual loopback proxy rejection, zero outbound connects on fake-IP answers, safe worker failure
  propagation, DoH transport options, both address families and hostile resolver responses.
- Docker/Pi and live resolver acceptance on the user's VPN/DNS network remain unverified.

## Version 2.25 changes

Validation: 593 tests across 72 files passed, plus lint, formatting, TypeScript/production build and native production
smoke checks.

- Grouped Settings and collapsed advanced browser/account inputs; existing API, stored credentials and preferences
  retained.
- Specific DeviantArt failure factory at the child-process boundary, with fixed safe codes and bounded HTTP/exception
  classifications. No provider prose, URLs, private paths, cookie values or tokens enter the new messages.
- Regression tests cover parser/HTTP/content/utility/storage errors, unknown exits, URL-only false positives and real
  subprocess error conversion. Form tests exercise the new expandable controls.
- No live reproduction from the user's Raspberry Pi was available. Root cause and live site acceptance remain
  unverified; this release improves error diagnosis and Settings usability, not a confirmed fix for the reported source.

## Version 2.24 changes

Validation: 571 tests across 71 files, lint, formatting, TypeScript/production build and native production smoke checks
passed.

- Global account-session failure popup with companion installation/transfer instructions for supported sites.
- Unsupported sources use manual cookie-import guidance; unrelated failure categories do not open the popup.
- Per-attempt dismissal, sequential failures and manual reopening from Library.
- Native modal dialog, Escape/Close controls, focus restoration and responsive scrolling layout.
- DOM regressions exercise failure transitions, polling, repeated attempts, simultaneous failures, dismissal,
  unsupported/lookalike domains and manual reopening. Native dialog APIs use test doubles in DOM tests.
- Live account acceptance, real-browser modal rendering and Raspberry Pi/Docker remain unverified.

## Version 2.23 changes

Validation: 566 tests across 70 files passed, plus lint, formatting, TypeScript/production build and native production
smoke checks. The companion ZIP is regenerated during every build.

- Independent saved site sessions with per-site browser identities, scoped refresh/removal and legacy migration.
- Source-specific media selection preserves the mounted-cookie fallback for unrelated sites.
- Packaged Chromium companion sends Instagram or DeviantArt cookies directly through a signed-in station tab.
- Optional per-site host permission, explicit destination confirmation, no background collection or cookie storage.
- Regression coverage: legacy migration, independent removal, replacement, metadata secrecy, source selection, companion
  domain isolation/HttpOnly handling, destination validation and same-origin JSON handoff.
- Companion browser APIs are tested with controlled doubles. Live extension installation, account acceptance, Raspberry
  Pi/ARM and Docker builds remain unverified.

## Version 2.22 changes

- Main DeviantArt connection panel shows server-loaded saved/absent/unknown account state and a reconnect action.
- Metadata read failures offer a nondestructive retry; recovery clears the stale status error.
- UI distinguishes durable saved credentials from unfinished OAuth and separate browser/CDN verification.
- Library recovery gives DeviantArt-specific cookie import guidance without promising challenge bypass.
- New regression tests cover remount recovery, transient read failure, OAuth persistence across reconstructed server
  applications, and cookies plus OAuth/cache retention after a blocked worker.
- Live source acceptance, actual account validity, mobile screenshots and Raspberry Pi/Docker remain unverified.

## Version 2.21.1 changes

- In-app setup names OAuth2 Redirect URI Whitelist and distinguishes it from Website URL.
- Instructions require saving the provider app before entering the same app's credentials in LinkDock.
- Homepage recovery guidance points to the whitelist and a fresh sign-in after correction.
- This copy-only patch uses existing connection/form tests plus lint, formatting and production build checks. The full
  556-test and native production smoke results below are from version 2.21.

## Version 2.21 changes

- HTTP authorization response field is visible before sign-in, with explicit setup/start guidance and disabled controls.
- Success, expiry and failed starts retain a visible response step; new attempts discard old links and clear responses.
- HTTPS stations explain their automatic return and how an HTTP-only deployment can correct a stale origin override.
- DOM tests cover initial visibility before setup, enabled pending submission, completed/expired disabled controls,
  failed replacement attempts and clearing response drafts when restarting.
- Live provider/account, Raspberry Pi/Docker and rendered mobile/browser acceptance remain unverified.

## Implemented changes

- Site video extraction with yt-dlp, packaged EJS and the container's Node runtime; ffmpeg merges separate streams.
- Instagram post/reel and carousel collection with gallery-dl, including images and pre-merged videos.
- Uploaded `.torrent` files, remote torrent metadata and BitTorrent v1 magnets through a private aria2 child process.
- Shared queue slots, cancellation, retry, persisted source/options, restart cleanup and source-aware progress.
- Isolated private staging, atomic multi-file publication and authenticated per-file browser downloads.
- Owner-mounted login cookies copied into temporary private sessions outside downloadable directories.
- A new dark-first workspace, complete light palette, persistent appearance switch and source/quality composer.
- Upgraded Docker image, optional read-only cookie mount, torrent peer ports and migration instructions.
- Mobile section shortcuts, full-width composer/search, stacked file actions and wrapping multi-file lists.
- Touch targets of at least 44 pixels for primary mobile controls, 16-pixel form fields and safe-area spacing.
- Responsive overrides load after all base styles, including multi-file save controls; pinch zoom remains available.

## Version 2.2 changes

- Explicit pause/resume for waiting and active work; manual pauses persist across restarts.
- Active restart recovery requeues work and retains private partial bytes and external-engine staging.
- Direct resume validates a strong ETag, exact final URL, disk offset, byte range and expected length.
- Direct range failures restart safely; encoded responses and unexpected partial responses fail closed.
- Torrent interruption requests a control-file flush before removing engine GIDs; resume verifies existing pieces.
- Remote torrent metadata is pinned atomically during a job, preventing URL changes from mixing torrent contents.
- Interrupted fragment and merge bookkeeping stays private when resumed media output is published.
- Persistent speed budgets, torrent upload limits, timezone-aware daily windows and a reserved-space floor.
- Preference validation, atomic owner-only settings writes and the existing authenticated/CSRF API boundary.
- Temporary policy holds preserve progress, release worker slots and recover when conditions permit.
- Space holds include a pending direct write in their restart threshold to prevent a tight retry loop.
- A mobile settings editor, visible hold explanation and distinct pause/resume/restart controls.

## Version 2.3 changes

- Multiline batches of up to 50 links, read-only review and commit-time validation before one atomic history write.
- Duplicate skips within batches and existing live/completed history; signed HTTP queries and video quality preserved.
- Canonical hex/base32 magnet identity; FIFO input order within persistent High, Normal and Low priorities.
- Accessible priority selectors, non-preemptive scheduling and waiting-order display in the Active view.
- Installable manifest, purpose-built icons and an optional native prompt with browser-menu fallback.
- Supported share-target GET navigation, memory-only link review through authentication and address-bar cleanup.
- Public-only offline fallback and icon caching; private app/API/download responses are never stored by the worker.
- Explicit browser permission, protected registration/status/test/removal APIs and private persistent signing identity.
- Real Web Push encryption, generic payloads, public-DNS-pinned HTTPS, bounded concurrent sends and expired-key cleanup.
- Finite-category alert coalescing, no download-worker wait for delivery and explicit shutdown/disabling behavior.
- HTTPS/contact deployment examples, optional Compose environment and backup/revocation instructions.

## Version 2.4 changes

- Optional backward-compatible library metadata, canonical bounded folders/tags and fail-closed history validation.
- Atomic label persistence with memory rollback on write failure and no physical file moves or queue-state changes.
- Touch/keyboard label editing, retained dirty drafts through polling, visible save failures and explicit reset.
- Combined status, folder, tag and text filters, Unfiled view, result counts and full reset.
- Literal text rendering for labels and collision-safe logical folder selector values.
- Lazy authenticated station diagnostics; the minimal public health probe remains unchanged.
- Actual process/runtime and volume measurements, storage permission checks and explicit unavailable measurements.
- Fixed local engine version vectors, no shell, three-second forced timeout and 8 KiB output cap per command.
- Sequential checks, cross-request coalescing and a one-minute cache for successful and failed engine checks.
- Private static recovery guidance, timestamped results, manual refresh and retained old data on reconnect failures.
- No additional dependencies or deployment variables; the existing Docker tools supply the engines.

New behavior tests cover Unicode label normalization and tag deduplication, restart persistence with unchanged saved
bytes, invalid-edit rejection, disk-write rollback, composed filters, literal label text and drafts retained through
polling and save errors. Health checks cover private/public API boundaries, filesystem and memory failures, fixed
command vectors, version sanitization, sequential single-flight caching and expiry, lazy UI requests and cancellation.
The native production smoke also saves real organization and executes the actual local version commands. Missing local
tools are reported as missing, rather than being counted as verified source downloads.

## Version 2.5 changes

- Explicit completed-only previews for recognized raster images, MP4 and WebM; no automatic media fetch or transcoding.
- Authenticated header preflight, validated open descriptors, symlink/path rejection and actual manifest-size checks.
- Explicit media MIME, restrictive response policy, no-sniff, same-origin resources and no-store delivery.
- Single byte ranges, HEAD handling, safe If-Range fallback and 416 responses for invalid/multiple ranges.
- A 25 MiB original-image preview limit, native muted inline video and clear local-save fallback after decode errors.
- Lazy stored ZIP generation with manifest-only entries, nested/empty/Unicode files and portable collision-safe names.
- Two station-wide export leases, deletion protection, preflight errors and release after abort/read cleanup.
- Open-time archive identity checks, native HTTP disconnect coverage and 30-second idle termination.
- `yazl` 3.3.1 added for production ZIP/ZIP64 streaming; `@types/yazl` 3.3.1 and `fflate` 0.8.3 are development-only.
- ZIP tests use an independent reader to compare fixture filenames and exact bytes. No ZIP extraction is performed.
- The native compiled-server smoke now also checks media range bytes and independently decoded ZIP output.

Tests cover authentication on GET/HEAD, unfinished output, allowed/rejected header prefixes, renamed HTML, oversized
images, symlink files, canonical indices, exact video byte spans, malformed ranges, archive preflight failures,
manifest-only output, Unicode/empty entries, changed identities, bounded leases, blocked deletion and a real HTTP client
disconnect. UI tests check explicit media setup, ordinary-save fallbacks, quiet controls, native errors, indexed
carousel previews, cancellation and ZIP request handoff without a whole-file Blob.

## Version 2.6 changes

- Touch-sized per-row selection and select-visible capped at 50 explicitly captured unique IDs.
- Selection survives progress polling without automatically including new arrivals; filter changes clear it.
- Polling removes selection and destructive review when a selected row leaves the current filtered view.
- Opt-in folder edits and keep/add/remove/replace tag modes; combined partial edits preserve untouched labels.
- Validation of every resulting tag set before one atomic history write, with complete in-memory rollback on failure.
- Owner-only bulk JSON route with bounded UUID membership, existing origin/session checks and no-store responses.
- Separate filename/recorded-byte deletion review, explicit confirmation, cancellation and in-flight controls.
- Whole-selection preflight for terminal states, worker cleanup, missing IDs and active ZIP exports.
- Sequential physical removal with explicit per-record outcomes, retained failed selections and no automatic retries.
- Restored in-memory history entry after a deletion history-write failure; already-deleted bytes remain irreversible.
- Wrapping controls in both themes, 44-pixel primary targets and 16-pixel mobile text/select fields.
- Native compiled-server smoke for real bulk HTTP routing, restart persistence and confirmed physical file deletion.
- No new runtime/development dependencies, history fields, deployment variables or volumes.

New tests cover malformed/duplicate/oversized IDs, unconfirmed deletion, session/origin/JSON protection, preservation of
individual labels, Unicode normalization and case-insensitive tag operations, merged tag overflow and all-record
rollback. Physical-file fixtures verify deletion rejection before any removal, active-export protection, partial I/O
outcomes and explicit retry. DOM tests cover visible-only membership, a 50-job cap, polling and filter invalidation,
review focus/filenames, cancellation, double-click protection, opt-in fields and retained failures. No browser render,
physical Pi, live media provider or public torrent network is used by these tests.

## Version 2.7 changes

- Atomic private outbox with fixed registration fingerprints, finite generic categories and no duplicated source data.
- At most 64 records and 64 KiB input; duplicate/invalid records fail validation without overwriting damaged state.
- Durable claims before network attempts, saved retry deadlines and restoration without replaying download history.
- Network/408/429/5xx retries, bounded exponential backoff, capped seconds/HTTP-date Retry-After and six attempts total.
- One-hour backlog expiry; revoked/rotated registrations and exhausted entries are pruned before future sends.
- Coalescing includes in-flight entries without extending expiry or resetting retry budgets.
- Shared two-request limit for explicit tests and background alerts; tests do not enter the durable outbox.
- Shutdown preserves pending work; failure to claim/acknowledge state suspends retries without a tight loop.
- Corrupt/unwritable backlog status remains visible while downloads and explicit browser tests remain separate.
- Lazy private aggregate status, explicit station-wide clear, retained snapshot/error feedback and cancellation.
- Clearing/revocation cannot recall an in-flight request and never resurrects its failed record after it settles.
- No new dependencies, environment variables, download-history fields or data mounts.

Deterministic tests use real private files and browser keys, mocked DNS/HTTPS sends and controlled clocks. They verify
restart deadlines/counts, expiry, coalescing bounds, Retry-After parsing, error classification, exact registration
rotation, revocation, shared concurrency, clear races, corrupt/oversized input and real atomic-write failures. They also
exercise failure to acknowledge an accepted attempt and recovery after storage repair, acknowledging possible duplicate
delivery. DOM tests cover lazy opening, refresh, explicit clear, stale/failed snapshots and rapid reopening. Native
compiled-server smoke restores a seeded future retry and checks private aggregate status and clearing without contacting
any provider. Live device display and exactly-once delivery are not claimed.

## Version 2.8 changes

- Private OS-visible CPU threads, 1/5/15-minute load averages, uptime and total/free memory, each with null fallbacks.
- Independent process/system labelling; no CPU utilization or container-quota interpretation is inferred.
- Optional system response field for older-client compatibility and a graceful UI fallback for older backends.
- CPU-specific thermal types, mounted/native fixed locations, strict millidegree parsing and a plausibility envelope.
- Bounded 256-byte fields with one overflow byte, nonblocking opens, no final-file symlinks and descriptor cleanup.
- Five-second cache, cloned results and coalesced sampling with a 500 ms thermal response deadline.
- Only one physical thermal probe until it settles, even after timeout, so callers cannot accumulate stuck file reads.
- No automatic monitoring loop, metrics persistence, remote probes, raw paths or unique host identification.
- Mobile-compatible system grid, independent sample time, clear unavailable guidance and valid-zero handling.
- Optional `compose.metrics.yaml` existing-source read-only CPU-zone mount; normal runtime privileges stay unchanged.
- No new dependencies, environment variables or saved-history fields; default deployment needs no override.

Tests use controlled OS counters, injected thermal reads and real bounded filesystem fixtures. They cover independent
native failures, malformed/oversized thermal values, zero readings, missing fields, unknown zones, symlink rejection,
cache/copy isolation, coalescing, timeout and recovery without overlapping probes. HTTP checks preserve authenticated
private snapshots and the minimal public health probe. DOM checks verify units, null/zero semantics and old-backend
fallback. The native production smoke validates the compiled health route with actual runtime counters or explicit
unavailability. YAML syntax and override structure are checked locally; actual Docker/Pi binding remains unverified.

## Version 2.9 changes

- New torrent/magnet jobs retrieve metadata with payload paused, then require an explicit nonempty file selection.
- One-based index lists and pinned metadata persist across restarts; selected logical bytes determine the payload limit.
- Selected indexes are reapplied before unpausing; unselected output and torrent bookkeeping are excluded from
  publication.
- Mobile/keyboard file checklists show file counts and sizes, select-all/clear actions, saved selections and errors.
- An authenticated loopback CLI supports pause/resume for one/all jobs, file review/selection and destination commands.
- Persistent global pause holds future submissions. Resume-all skips torrents awaiting file review, while interrupted
  metadata retrieval can resume. Existing daily windows, concurrency and disk holds remain effective.
- Bounded one-shot explicit-offset schedules persist with outcomes, cancellation and overdue startup execution.
- Running commands replay idempotently after restart; persisted malformed controls fail closed before workers start.
- Per-job physical completion destinations work for active and already completed downloads under a configured root.
- Cross-filesystem streaming copies use private staging, a flushed hash journal and atomic destination publication.
- History switches delivery before internal source cleanup; interrupted publication is verified before adoption.
- Move errors keep internal originals and expose a retry using saved payload rather than a new source request.
- Destination paths reject traversal, symlink ancestors and overlong UTF-8 segments. Existing unowned output is
  retained.
- Moved files retain authenticated downloads, supported previews and multi-file ZIP export; deletion removes managed
  output.
- Default completion storage uses the data volume; an optional existing-host bind mount targets USB/SSD storage.

New tests exercise magnet metadata handoff/pinning without unpausing content, selected-size limits, changed manifests,
index validation, selection rollback and selected-only publication. Control tests execute actual loopback authentication
under secure-cookie/proxy settings, keep passwords/source queries out of command output, replay overdue controls before
workers, cancel schedules, retain pause-all through restart and reject malformed timestamps/commands. Completion tests
use real file copies, restored history, private file/preview/ZIP routes, symlink/collision rejection, a failed history
commit, digest-mismatch recovery, aborted work and move-only retry after storage repair. DOM tests submit exact selected
indexes and destinations and retain rejected drafts. The native compiled smoke executes CLI, schedule creation/cancel,
selection and a saved-payload move without starting a torrent engine or contacting a content source.

## Version 2.10 changes

- Video source ceilings expand to 360p/480p/720p/1080p/1440p/2160p plus best available, with separate output format UI.
- MP3 extraction uses an actual ffmpeg conversion with 128/192/320 kbps targets and removal of source intermediates.
- Persisted MP3 quality values survive reload/retry; batch identity separates video, audio and different bitrates.
- Auto routes direct media links through extraction for MP3; incompatible file/torrent/magnet requests fail validation.
- Instagram's collector retains original media; explicit Video mode can request extraction for video posts.
- Mobile format/quality controls reset and disable unsupported choices; failed requests keep their inputs.
- An idle-time utility updater installs yt-dlp/gallery-dl into private Python releases and checks dependencies/versions.
- aria2/libaria2 candidates use signed image repositories, strict package identity and native dependency compatibility.
- Active pointers publish only verified sets; package/native files are never installed into system/host directories.
- A queue-owned maintenance gate excludes new downloads, waits for active workers and reaps idle torrent daemons.
- Runtime executable selection applies to media/torrent workers and version diagnostics, with packaged fallback.
- Persisted update preferences, requests, statuses, safe step feedback, cancellation, previous-version rollback and
  bundled restore are provided.
- Docker initially enables daily updates after startup grace; saved owner settings take precedence over that default.
- Private authenticated JSON API, lazy browser controls and fixed CLI utility commands accept no executable/repository
  input.
- Process-group cancellation, per-command timeouts, sampled free-space/staging/file limits and bounded output are
  enforced.
- Installer temporary files use private writable state; the container continues to run as UID 1000 with a read-only
  root.
- A standalone Pi Compose example matches the user's bind mounts, `link_dock` service and port 7489.
- No JavaScript dependencies changed; pinned packaged tools remain fallbacks. ffmpeg/base updates require an image
  rebuild.

New tests cover every quality, MP3 argument vectors, history persistence, representation-aware duplicates, unsafe input,
selected-only MP3 publication and actual UI submissions. Updater tests cover waiting/restart, automatic cadence,
coalescing, cancellation, failed preparation, failed activation writes, corrupt-state fallback, idle restore,
authentication/origin checks, command-output bounds and signed-package argument/dependency boundaries. Real child tests
verify final stdout without a newline and queue maintenance exclusion; a local fixture daemon exercises RPC-port reuse
after reaping. Fixture binaries validate execution routing without an external package download. New native production
smoke coverage checks compiled quality persistence, managed execution and authenticated update CLI control.

An additional offline verification used the installed yt-dlp/ffmpeg to generate a two-second synthetic MP4 and convert
it with the application's MP3 policy. `ffprobe` confirmed codec `mp3` and 192,000 bit/s; the intermediate converted MP4
was removed. All six height filters and MP3 arguments parsed with the installed yt-dlp. The installed gallery-dl parser
accepted `--config-ignore`; health/updater probes now use that option. A local Debian metadata fixture confirmed an
absent Pre-Depends field returns an empty successful result. These checks do not certify live provider access or a
complete Docker/ARM64 update installation. Signed-index downloads/extraction are exercised with command fixtures, not a
real external APT/PyPI upgrade in the deployed container.

## Version 2.11 changes

- A station-wide `completionDirectory` preference supplies the destination for all newly created downloads.
- Single/batch links, magnets and uploaded torrent jobs inherit an independent snapshot of the saved default.
- The exact `.` marker selects the configured completion root while other dot/traversal/absolute paths remain rejected.
- The mobile settings form exposes automatic moves, a default folder, persistence feedback and reset/disable controls.
- Legacy settings load disabled; older clients omitting the field preserve the saved default on writes.
- Existing jobs and per-job overrides stay unchanged when the default changes or is disabled.
- Destination-only preference changes do not abort or reconnect active downloads.
- Inherited destinations use the existing verified copy/publication, recovery, permission and private delivery paths.

New tests exercise settings authentication, legacy migration, persistence after reload, safe path validation, all job
creation entry points, explicit per-job overrides/opt-out, global disable and a real streamed fixture moving into the
completion root. UI tests save/disable the default and reset drafts. An active-stream test checks folder changes leave
the source's abort signal untouched. The compiled production smoke covers inherited uploaded torrents and actual
root-folder publication, alongside existing CLI overrides. Docker/ARM64 and physical storage acceptance remain pending.

## Version 2.12 changes

- Separate Overview, Download library and Settings pages with shared active links on desktop and phone.
- Stable fragments retain bookmarks, Back/Forward, reloads, old notification links and shared-link composer entry.
- Station controls, global completion settings, device appearance/install/alerts, utility updates and diagnostics now
  reside on Settings; utility updates no longer depend on a successful health snapshot.
- React Activity retains local drafts, filters and selection while hidden pages disconnect effects.
- The shared authentication/queue polling owner remains mounted; page changes do not change server scheduling.
- Video previews pause on navigation and retain their player; canceled preflight becomes retryable on return.
- Page-specific titles, active-link announcements, visible headings and skip-to-content focus support keyboard users.

UI tests cover both navigation surfaces, page separation, global settings discoverability, draft/filter preservation,
Back/Forward/remount, bookmarks behind the password gate, old share/notification entry points, transfer action routing,
independent update controls, request cancellation, skip-link focus, paused hidden video and canceled preview retry. All
existing private API, source engine, completion and production smoke coverage remains in place. The page-layout checks
use jsdom, not rendered browser screenshots; physical mobile/Docker/Pi acceptance remains pending.

## Version 2.13 changes

- DeviantArt gets a dedicated source selector and automatic routing for art/story/gallery/profile URLs.
- Gallery-dl collects originals, available videos, galleries/subfolders and plain-text literature/journals.
- Profile dispatch includes galleries and journals, with no automatic unwatch or extra-content crawling enabled.
- Gallery mode reuses managed gallery-dl, private browser cookies, public-only egress, per-file delivery and completion.
- Media staging measurements now also enforce file count and directory depth during collection.
- Tests cover DeviantArt URL families, host/MP3 validation, fixed collector options, history, UI submission and a mixed
  story/photo/video gallery published through the actual queue and moved to the global completed folder.
- The installed gallery-dl recognized all checked DeviantArt entry classes without contacting the site, and its actual
  literature formatter produced plain-text story content. This does not verify live source/API/account access.

- A 29-family catalogue expands automatic extractor routing and adds searchable source guidance on Settings.
- Private Netscape import, bounded User-Agent, metadata-only responses and explicit removal support browser
  verification.
- Imported media jars become disposable private copies; direct cookies are scoped by domain/path/HTTPS/expiry on every
  redirect and remain outside history and published files. Mounted media-cookie fallback remains supported.
- Failed/canceled file/media records expose an explicit browser/final-link handoff with no automatic source submission.
- Direct 429/503 responses honor bounded Retry-After with cancellation and visible wait stages; persistent cooldowns
  fail.
- Unattached HTML/XHTML responses fail before publication rather than pretending to be downloaded files.
- Fixed video identity/pacing options and extractor retries retain shell-free invocation and public-only media proxying.

New checks cover cookie parsing/scope, authentication/origin boundaries, no-secret metadata/history, private file modes,
import/remove/corrupt recovery, mounted fallback, safe engine vectors, all catalogue domains and lookalikes, final-link
handoff, HTML challenge rejection and real local HTTP headers/retry attempts. UI checks import/remove sessions, save
pacing, queue final links and search sources. Native production smoke checks compiled session routes, scoped headers and
disposable credential copies. Installed yt-dlp/gallery-dl parsers accepted the new identity/pacing flags, and the
installed yt-dlp extractor catalogue contains the added families (Odysee uses the LBRY extractor). These offline checks
are not live media-provider or CAPTCHA success tests. Physical Pi/ARM64, browser-bound verification, countdown host
compatibility and network/IP-bound cookie acceptance remain deployment checks.

## Version 2.14 changes

- Settings adds saved DeviantArt profile collections, original-file selection and TXT/HTML/skip textual content.
- Optional refresh-token and matching custom-client setup uses a write-only private API with session/CSRF protection.
- Bounded credentials and whitelisted preferences remain outside history, public output and process arguments.
- Private disposable worker configuration combines with persistent account-specific SQLite token rotation caches.
- Account import/removal creates/deletes cache generations; explicit removal also recovers damaged private state.
- Cancellable per-station source serialization prevents concurrent refreshes; credential changes reject busy accounts.
- Active workers retain their source settings snapshot; new starts read saved preferences.
- Password drafts clear on submission, disclosure close and settings-page effect cleanup.
- Responsive source forms reuse existing dark/light tokens, 44px targets and 16px text fields.

New server tests cover API authentication/origin/no-store, secret omission, bounded input, file permissions, token/cache
paths, cache retention, replacement/removal, symlink rejection, corrupt-state recovery, locking/cancel and real pipeline
cleanup. DOM tests cover scoped preferences, secret-field clearing, source status, failed writes and stale-read removal.
Compiled native smoke covers account setup, cache persistence, busy-account rejection and removal. Installed gallery-dl
is checked offline for application CLI/config loading and rotating cache reuse across fresh processes with a simulated
token endpoint. No real account, external provider download, physical Pi or ARM64 Docker build is claimed verified.

## Version 2.15 changes

- New single/batch DeviantArt jobs pin whitelisted collection choices in history, independently of private credentials.
- Duplicate identity includes the canonical scope; retries/resumes retain it and workers use it despite changed
  defaults.
- Legacy unbound partials are preserved and held paused on real queue startup, with explicit Restart guidance.
- Individual/all resume cannot append to ambiguous old staging; Restart binds current choices and discards that staging.
- Empty legacy jobs bind and persist choices before engine startup; completed/published payloads remain accessible.
- Library exposes saved collection choices and a lazy, searchable, type-filtered and naturally sorted file browser.
- Rendering is capped at 25 file rows per page; canonical manifest indexes remain stable across every view operation.
- Page/filter transitions cancel pending preview preflight; full-collection ZIP behavior is labeled explicitly.

New tests check history validation, credential omission, independent batch snapshots, scope-aware duplicate review, real
startup recovery, retained partial bytes, explicit restart, empty legacy worker recovery and pinned engine vectors. DOM
checks exercise 2,000-file lazy rendering, no automatic file fetches, original download indexes, document/type filters,
natural/size sorting, page clamping, empty states, preview cancellation and legacy transfer controls. Existing file-link
rendering expectations now explicitly open the lazy collection first. Native compiled smoke verifies API pinning,
duplicate review and restart persistence. DOM tests do not measure rendered geometry or physical touch input. No live
provider/peer swarm, physical Pi, ARM64 Docker execution or fresh real OAuth authorization is claimed verified.

## Version 2.16 changes

- Pornhub and six additional yt-dlp video families join automatic routing and the searchable source catalogue.
- Known Pornhub/Premium domains, XVideos/XNXX aliases and RedTube's Brazil domain use exact/subdomain matching.
- Existing video quality, MP3 conversion, cookie handling, proxying and managed yt-dlp updates are reused.
- The package.json pnpm pin is restored to 12.14.0, matching Dockerfile and the documented toolchain.

Focused API tests verify Pornhub Auto detection, retained video quality and MP3 bitrate, separate duplicate identities,
saved history and private-cookie argument construction. Hostname-lookalike rejection and explicit Direct mode are
checked. Existing catalogue tests now exercise every added domain; UI tests find each source by name/domain. Native
production smoke checks compiled Pornhub video/MP3 queueing and argument vectors without fetching a source page. Offline
installed-extractor checks use synthetic watch/embed URLs only and do not fetch media or account data. The upstream
yt-dlp supported-sites catalogue was checked. No live provider download or fresh Pi/Docker run is claimed.

## Version 2.17 changes

- Library video jobs expose requested output and can explicitly queue another quality/MP3 version from the original URL.
- The new authenticated owner action preserves original records/files and reuses standard duplicate/history/defaults.
- Fixed bounded engine error hints replace undifferentiated media failures with safe persisted categories and guidance.
- Known format, account, verification, access, rate, region, unavailable, DRM, network and utility failures get
  guidance.
- URL text is removed before hint matching; raw diagnostics are not retained by the new error or saved queue fields.
- Cancellation remains authoritative, unknown failures retain a generic fallback and retries clear stale categories.
- Browser CAPTCHA assistance is hidden for classified cases where it would mislead the owner.

New checks exercise category priority/fallback, URL/query exclusion, real subprocess errors, safe error objects and
cancellation. Integration tests verify persistence in the real queue and private dashboard, optional/invalid history
fields, origin/auth protection, duplicate/quality/source rejection, use of the original URL, completion defaults,
retained original partial bytes and rollback on failed history writes. DOM tests cover quality/MP3 copies, rejected
choices, source scoping, recovery links, no automatic requests and category-specific browser assistance. Native smoke
executes a real compiled subprocess failure and queues a new version through the compiled API while retaining originals.
No live provider failure, media download, fresh OAuth session or physical Pi/ARM64 Docker run is claimed verified.

## Version 2.18 changes

- A mobile-compatible Settings connection uses a confidential DeviantArt app, one-time registered station callback,
  authorization code + PKCE S256, random browser-bound state and same-tab provider sign-in. Only `browse` is requested.
- Owner-only app setup and starts use existing JSON/origin checks. The callback alone accepts the cross-site return,
  bound to a dedicated HttpOnly SameSite=Lax cookie; the station session cookie retains SameSite=Strict.
- The Pi exchanges the code through a fixed HTTPS endpoint with a 30-second deadline, 16 KiB body cap and no redirects.
  Tokens/client secrets never enter browser responses, navigation URLs, queue history, logs or process arguments.
  Provider authorization codes travel only in the standard provider callback request and server-side exchange.
- Pending state/verifiers are memory-only, one-use, capped at eight and expire after ten minutes. Restarting invalidates
  them. Repeated starts replace that browser's abandoned flow only after a new start can proceed. Explicit app/account
  changes invalidate pending flows. Account writes/exchanges serialize with downloads; preferences are preserved.
- Private mode-0600 app setup survives restarts under the existing private DeviantArt directory. New account generations
  reuse the persistent rotation-cache mechanism. Canceled/rejected exchanges preserve the existing account. Removing an
  account retains reusable app setup. Advanced manual imports remain supported independently.
- DeviantArt engine arguments explicitly set HTTP timeout/retry limits and disable automatic watching/unwatching. Live
  bounded stderr hints interrupt upstream's unbounded API 429 and CloudFront block loops; rejected grants get a
  reconnect message. All visible text is application-authored and raw diagnostic text remains private.
- A three-minute no-progress watchdog measures staging changes and distinct completed/skipped file output. Repeated logs
  cannot keep a worker alive indefinitely; legitimate growing files and resumed collection scans remain active. Failure
  terminates the process group, releases private sessions and account ownership, and persists a safe reason.

New regression checks cover authorization/setup authentication and origin rejection, private file permissions, exact
callback selection, PKCE challenge verification, cross-site cookie handling without the strict owner cookie, replay and
cross-browser rejection, expiration, denial, account/app changes, pending caps and symlink rejection. Concurrent
exchange tests preserve preference changes and reject account writes/replays. UI checks cover write-only setup, return
navigation, outcome cleanup, failed connection recovery and stale metadata races. Process tests terminate a real looping
child on a rate-limit diagnostic; queue integration verifies the durable failure category and released account lock.
Watchdog checks cover actual byte progress, fixed error text and distinct resumed-file activity versus repeated
diagnostic output. The native production smoke repeats compiled authorization with a mocked token endpoint and a real
looping subprocess.

No real user account, live provider authorization/download, physical Pi/ARM64 image build or rendered browser layout was
verified. App registration and callback acceptance must be checked against the owner's actual DeviantArt app and
browser-facing station address. These changes bound known waits and expose failures; they cannot establish the exact
cause on a user's running Pi without a new download attempt. Existing Restart clears private partial staging as before.

## Version 2.19 changes

- Corrected the 2.18 direct callback assumption for HTTP-only deployments. HTTP browser origins now use gallery-dl's
  documented HTTPS landing page as the registered redirect; HTTPS origins keep their direct automatic callback.
- HTTP owners start authorization in Settings, open the provider in a separate tab, copy the full resulting HTTPS or
  localhost response URL back into a password input and finish the exchange through the app. One response paste is
  required per authorization. The app still retrieves, stores and refreshes the token; there is no token copying.
- The original page remains open through a user-activated `noopener noreferrer` link, avoiding asynchronous popup
  blockers and cross-origin opener dependencies. Successful exchange refreshes only non-secret account metadata.
- Copied responses require an authenticated same-origin JSON POST, the originating browser's HttpOnly binding cookie,
  one-use state, matching return mode and server-held PKCE verifier. The original HTTPS redirect is pinned through
  exchange. A public direct callback cannot consume a copy-mode transaction or clear its cookie on a mismatch.
- Only the exact gallery-dl HTTPS landing address or its known localhost:6414 root is accepted. Arbitrary hosts, altered
  ports/paths, URL credentials, fragments, duplicate state/code/error parameters, missing/ambiguous responses and
  oversized fields are rejected. The pasted URL is never fetched; the fixed HTTPS token endpoint is the only exchange
  destination. Responses/errors contain application-owned result categories only.
- Return inputs clear immediately on submission and unmount; authorization codes are not held in React state,
  local/session storage or download history. The pending authorization URL contains only the provider request's state
  and challenge. Existing ten-minute expiration, pending caps, account locks and token rotation cache apply.
- Setup documentation now provides the correct HTTPS redirect for HTTP stations, upgrade instructions, expected
  localhost error behavior and the limits of automation. It no longer directs HTTP users to register their LAN callback.
  HTTP station cookies stay non-Secure as configured; no new mount, port, domain, certificate, VPN or dependency is
  added.

Regression tests cover both allowed response destinations, exact HTTPS redirect reuse during PKCE exchange, private
account persistence and replay, missing owner cookies, different browsers, rejected origins, transport mismatch,
arbitrary/malformed/oversized URLs, swapped state, provider denial/failure, expiration, account changes and active
download locks. DOM checks cover HTTP new-tab instructions, cleared response fields, automatic account metadata refresh,
invalid-return correction and expired-flow restart. Existing direct HTTPS flow tests remain intact. The native
production smoke exchanges a copied response through the compiled HTTP API using an offline token response and verifies
replay.

The public landing page was fetched for inspection: its script forwards the query to `http://localhost:6414/`. No live
user authorization, external token exchange/download, mobile browser layout or physical Pi/ARM64 Docker run was
performed. Actual DeviantArt app registration and acceptance of the HTTPS landing redirect require the owner's account.
This mode automates token retrieval and subsequent refresh, with one explicit response-URL paste at sign-in.

## Version 2.20 changes

- HTTP authorization now exposes a selectable read-only **Full authorization URL**, alongside the provider button.
  Selection works without the HTTPS-only Clipboard API. A login-first link and homepage recovery guidance explain when
  to return to LinkDock and generate a fresh request using the same signed-in browser.
- New provider requests set the documented `view=login` parameter. Existing PKCE S256, confidential app, browse scope,
  fixed HTTPS redirect and browser-bound state remain unchanged.
- Client link validation now requires the complete single-valued OAuth request fields, fixed provider endpoint,
  generated proof formats and HTTPS callback. Bare/malformed links, duplicate fields and URLs containing private token,
  verifier or secret fields are rejected with fixed messages. Parser errors do not echo submitted URL material.
- The copied-response API identifies a provider homepage/login URL using a fixed application-owned error class and
  returns recovery guidance instead of a generic URL error. It does not consume the pending authorization, clear its
  binding cookie or contact the provider for that invalid paste. Untrusted URL parser messages remain suppressed.
- Regression coverage verifies selecting the complete link, refreshed request URLs on new starts, malformed-link
  rejection in the UI, homepage-paste recovery without loss of the valid pending grant, and actual backend-generated
  URLs passing the browser validator. Native production smoke checks the compiled generator includes `view=login`.

The provider documents the login-view parameter. No real account, logged-out/login redirect chain, mobile layout or
physical Pi/ARM64 Docker execution was verified. These changes expose the request and improve login recovery; they do
not establish why the owner's specific browser/provider session reached the homepage.

## Executed checks

| Check                                 | Result                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`      | Passed against the committed dependency graph                      |
| `pnpm lint`                           | Passed; zero errors and zero warnings                              |
| `pnpm format:check`                   | Passed                                                             |
| `pnpm typecheck`                      | Passed for browser, tests and server                               |
| `pnpm test:run`                       | Passed; 560 tests across 69 files                                  |
| `pnpm build`                          | Passed; frontend and compiled server produced                      |
| `pnpm test:production`                | Passed; compiled MP3, utilities, CLI, moves and private delivery   |
| Component-size and source-line checks | Passed; at most 100 lines and 120 columns                          |
| Named function documentation checks   | Passed; typed parameters and JSDoc present                         |
| Manual constants/prop review          | Completed for new source, engine and appearance boundaries         |
| Media engine package installation     | Pinned yt-dlp and gallery-dl installed in isolated scratch tooling |
| Media engine CLI parsing              | Actual installed parsers accepted the application's arguments      |
| Compact video progress template       | Evaluated using the installed yt-dlp formatter                     |

New tests check batch validation/rollback, stable signed-link identity, duplicate reviews, FIFO priorities and saved
manual pauses; shared drafts retain exact query strings without automatic submission. Notification tests use real
cryptographic key generation and encryption with mocked HTTPS and browser push surfaces. They verify authentication,
CSRF, registration persistence, invalid-key rejection, DNS checks, endpoint expiry, coalescing, send concurrency,
explicit permission and offline local revocation. Worker VM tests execute the shipped script and check exact public
cache scope, credential omission, API/script bypass, reconnect fallback, bounded notification text and fixed click
destinations. A separate native Node smoke check loads the compiled server, creates a real local signing identity and
verifies public mobile asset MIME types and private API/state boundaries. It caught and fixed a CommonJS named-import
mismatch masked by the test transformer. No real notification permission or external provider message was requested
during validation.

The automated suite covers source classification, malformed magnets and options, safe argument vectors, structured video
progress, private cookie permissions and cleanup, real child-process cancellation, torrent upload persistence, magnet
GID handoff, quota rejection and torrent cleanup. It also covers real proxy rejection of a private destination, nested
artifacts, symlink/path containment, atomic multi-file publication, failure cleanup, authenticated individual artifact
delivery, source selection and appearance persistence. All original direct-file, authentication and queue recovery tests
remain included. The mobile navigation integration test checks native keyboard focus and that every shortcut resolves to
a real section. New checks cover safe range continuation and fallback, actual HTTP range headers, partial-file recovery,
persistent manual pauses, schedule holds, DST, free-space holds, pacing cancellation, policy API protection, settings
drafts and resumed media staging. Old restart expectations were updated to the new recovery behavior. DOM tests do not
measure responsive layout, touch geometry or software keyboard behavior.

Torrent RPC behavior uses deterministic engine responses. Site output publication uses deterministic extractor fixtures.
These exercise the application integration without depending on third-party accounts or a live peer swarm.

The media packages actually installed for CLI verification were:

| Package    | Version                                     |
| ---------- | ------------------------------------------- |
| yt-dlp     | `2026.8.19`                                 |
| gallery-dl | `1.32.17`                                   |
| yt-dlp-ejs | `0.8.0`, supplied by yt-dlp's default extra |

No React component exceeds 100 lines. The convention script prints the largest components and their exact sizes during
lint.

Native Oxlint checks meaningful numbers. Behavioral strings, routes, source identities, engine limits, progress prefixes
and appearance storage identifiers were reviewed manually and centralized where reused. No claim is made that lint can
prove string semantics or visual quality. The generated dependency lockfile is excluded from authored line-width limits.

## Requirement resolutions

1. **Backend added.** The supplied attachment defines frontend standards. The requested Pi-side downloads require a
   backend, so a typed Express service, native streaming worker and Docker deployment are included. Browser-only
   downloading would stop being useful when the browser closes and would not save files on the Pi.
2. **Oxlint plugins enabled.** `typescript`, `react`, `import` and `jsx-a11y` are explicitly configured.
3. **JSX filename conflict corrected.** Only the allowed extension value was changed from `.js` to `.tsx`; severity
   remains `error`.
4. **Console exception scoped to the logger.** The global `no-console: error` rule remains. An override permits console
   only in `src/lib/logger/**`.
5. **Magic-number enforcement added.** Native `no-magic-numbers` is enabled at error severity with `ignore: [0, 1, -1]`,
   `ignoreArrayIndexes: true` and `enforceConst: true`. No constants-folder suppression was necessary.
6. **Five unsupported Oxlint rules are enforced separately.** Oxlint 1.88.0 rejected the following names when the
   supplied configuration was actually run. They cannot remain in that file without preventing lint from starting. The
   supported rules retain their original relative order and values; these exact original entries live in
   `unsupported-rules.json` and are enforced by ESLint in the same `pnpm lint` command:

   | Unsupported in Oxlint                     | Replacement enforcement                                       |
   | ----------------------------------------- | ------------------------------------------------------------- |
   | `camelcase`                               | Same ESLint core rule, original severity and options          |
   | `react/no-unused-class-component-methods` | Same rule in `eslint-plugin-react`, original warning severity |
   | `react/no-deprecated`                     | Same React plugin rule, original warning severity             |
   | `react/destructuring-assignment`          | Same React plugin rule, original warning severity             |
   | `react/forbid-foreign-prop-types`         | Same React plugin rule, original error severity               |

   Warnings fail both tools. ESLint 9.39.5 is used because the current React plugin declares compatibility through
   ESLint 9, not ESLint 10. This is a development-only compatibility pin; ESLint 9 is marked deprecated by its
   publisher.

7. **TypeScript 6.0.3 compatibility pin.** The latest stable registry release, TypeScript 7.0.2, was installed first.
   Its native compiler crashed here with `readlink /proc/self/exe: no such file or directory`. TypeScript 6.0.3 retains
   the JavaScript compiler and was used for all successful checks. This is the explicit exception to the latest-stable
   request. Strictness was not weakened. Upgrade the compiler when the native runtime is supported in your build
   environment.
8. **Complementary convention enforcement.** Prettier is not a hard line-length validator; the custom convention script
   verifies source lengths and component sizes. String meanings, useful documentation and naming still require review;
   there is no claim that a linter proves the absence of magic strings.
9. **Native fragment navigation.** Version 2.12 adds Overview, Library and Settings pages using the browser history and
   hashchange event without a routing dependency. React Activity preserves view state and disconnects hidden effects.
   Plain tokenized CSS avoids an extra styling runtime. Inline single-use labels and HTML attributes follow the
   attachment's explicit self-explanatory-string exception. CSS values are design declarations in styling files.

All other supplied Oxlint rule values remain unchanged. `typescript/no-explicit-any` is additionally enabled. No broad
suppression comments or ignored TypeScript errors are used.

## Additional version 2 resolutions

- **External tools are required.** The requested protocol and extraction support needs Python media tools, ffmpeg and
  aria2. Docker installs these; JavaScript packages continue to use pnpm exclusively. No user-supplied shell arguments
  are accepted.
- **Instagram authentication is optional but sometimes required by the source.** An owner-supplied Netscape cookie jar
  is supported through a read-only mount. LinkDock does not collect social account passwords or bypass source
  permissions.
- **Torrent networking differs from HTTP egress.** aria2 owns peers, trackers, DHT and webseeds. These connections do
  not use the HTTP media proxy. This limitation and host-level egress options are explicit in the README.
- **Application quotas are not kernel quotas.** Torrent and media checks are sampled. Media staging allows temporary
  merge duplication; final publication still requires the entire job to fit the configured ceiling.
- **Torrent scope:** v1 magnets and uploaded/remote torrent metadata support explicit file selection for new jobs.
  Legacy jobs retain their all-files behavior. Pause/resume retains verified pieces through the engine. Shared pieces
  may include neighboring file bytes. Post-completion seeding and pure v2 magnets remain outside this release.
- **Media scope:** one site video or one Instagram post/reel is collected per job. Video height options apply to yt-dlp;
  Instagram uses its available pre-merged formats. Profiles, stories, DRM bypass and bulk account archives are not
  included.

## Unverified deployment conditions

### Mobile acceptance matrix (pending real-device/browser execution)

| Viewport or setting                    | Checks to perform                                                           |
| -------------------------------------- | --------------------------------------------------------------------------- |
| 320, 375, 390 and 430 CSS pixels       | No horizontal scroll; controls fit; search stays full-width.                |
| 540, 760, 768 and 1024 CSS pixels      | Resize across breakpoints; metrics and navigation reflow without clipping.  |
| Phone landscape with a cutout          | Header, composer and actions remain inside safe areas.                      |
| Safari on iOS and Chrome on Android    | Paste links, open keyboard, submit, change quality and upload a torrent.    |
| Long filenames and large manifests     | Expand file list; save an item; confirm or dismiss delete without overflow. |
| HTTPS installation and share menu      | Install, share through the gate, then explicitly submit.                    |
| Notifications with tab closed          | Grant, test, disable/re-enable; check text and click destination.           |
| Offline navigation and updates         | Public reconnect page; no API/file cache; worker updates.                   |
| Bulk selection and deletion review     | Select/filter/poll; inspect filenames, keyboard focus and error feedback.   |
| Both themes, 200% zoom, reduced motion | Read content and reach all controls using touch and keyboard.               |

The matrix records required manual acceptance work, not completed device tests. Source/CSS review and DOM interaction
tests passed; this environment does not provide rendered viewport measurements. Proposed roadmap features in the README
remain future work. Pause/recovery, station controls, mobile installation/sharing, batch priorities and optional alerts
are implemented; version 2.4 adds organization/private diagnostics, version 2.5 adds media/ZIP delivery and version 2.6
adds bulk organization and reviewed deletion; version 2.7 adds durable alert retries, and version 2.8 adds system
readings and optional CPU temperature. Version 2.9 adds torrent selection, terminal scheduling and completion moves.
Version 2.10 adds quality/MP3 choices and idle utility updates. Version 2.11 adds a global completion-folder default.
Version 2.12 separates the Library and Settings pages. Platform acceptance remains pending.

- **Live Web Push and installation:** provider delivery, VAPID contact acceptance, device permission behavior, native
  installation, share-target availability and worker update behavior have not been verified in a real browser. Secure
  contexts, supported browsers and provider connectivity are deployment requirements. Alerts are generic, best effort
  with bounded durable retry attempts. Crashes/storage failures can cause duplicates or missed events; provider
  receipts, private webhooks and permanent alert history are not claimed.
- **Health diagnostics:** resident-memory access is unavailable in this restricted runtime and correctly returns null.
  System counters can describe the host or a VM rather than container resource limits. Temperature is checked with
  fixtures; physical Pi sensor availability, thermal calibration and the optional bind mount are unverified. Readings do
  not certify cooling, power delivery, throttling, drive health or media-source access. Physical-device measurements
  remain deployment checks.
- **Native media and ZIP clients:** real browser image/video decoding, codec compatibility, mobile seek controls,
  programmatic attachment handoff and multi-gigabyte/ZIP64 extraction are not certified here. Fixtures validate header
  recognition and HTTP bytes rather than playable video. Previews serve original files; archive data is stored without
  compression and cannot resume. Large-transfer throughput, connection interruption and idle behavior need device QA.
- **Docker and physical Pi/ARM64:** no Docker daemon or Raspberry Pi was available. System packages and
  architecture-specific image build behavior were not executed here. Build and smoke-test on the Pi before relying on
  large transfers.
- **Live torrent network:** real paused metadata/file-selection behavior needs Pi acceptance; no aria2 executable or
  public peer swarm was used here; RPC lifecycle behavior is tested with fixtures. Port forwarding, tracker
  reachability, DHT and real swarm throughput depend on the deployment network.
- **Live utility updates:** real PyPI/APT access, signature/index failures on an actual network, private data-mount
  execution, image-library compatibility, noexec/read-only mount behavior and post-update source downloads need Pi
  acceptance. aria2 follows the image repository rather than the newest upstream release. ffmpeg/base packages update by
  image rebuild. Package updates intentionally execute trusted external utility code; disabling automatic checks
  preserves the selected set.
- **Live site downloads:** no YouTube/Instagram account or cookie jar was accessed. The installed engine parsers and
  progress formatter were verified, but a successful authenticated third-party media download is not claimed.
- **Browser visual QA:** a bundled Chromium was obtained, but it exited before opening a browser page in this
  environment. Automated DOM interactions passed; desktop/mobile screenshot review and real screen-reader testing remain
  unverified.
- **USB storage and HTTPS proxy:** these require the owner's device and network. Configuration examples are provided; no
  remote device, account, certificate or mount was changed.

The handover includes `QUICKSTART.md`, detailed `README.md`, `compose.yaml`, optional `compose.cookies.yaml`,
`compose.destinations.yaml`, standalone `compose.rpi.yaml`, a Dockerfile, explicit media engine requirements and all
source/tests. Keep the old data volume when upgrading, rebuild the image, then verify a small direct file, one site
video, an Instagram post and a well-seeded public torrent on your Pi.
