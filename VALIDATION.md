# LinkDock 2.10 delivery and validation

Validated on 18 October 2026 using Node 24.19.0 and the committed dependency lockfile. The project pins pnpm 12.14.0;
this session's provided command wrapper reports 11.25.0. A fresh Docker/Pi toolchain build remains unverified. Version
2.3 adds `web-push` 3.6.7 and development types 3.6.4 for maintained encryption and VAPID signing; the application uses
its own bounded, public-DNS-pinned HTTPS transport rather than the package's buffered delivery transport. Existing
frontend and media-engine versions remain pinned by the committed manifests and lockfile.

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

## Executed checks

| Check                                 | Result                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`      | Passed against the committed dependency graph                      |
| `pnpm lint`                           | Passed; zero errors and zero warnings                              |
| `pnpm format:check`                   | Passed                                                             |
| `pnpm typecheck`                      | Passed for browser, tests and server                               |
| `pnpm test:run`                       | Passed; 372 tests across 52 files                                  |
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
9. **Single screen without a router.** The app has no separate routes, so React Router was not added. Plain tokenized
   CSS avoids an unnecessary styling runtime. Inline single-use labels and HTML attributes follow the attachment's
   explicit self-explanatory-string exception. CSS values are design declarations in the styling files.

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
Version 2.10 adds quality/MP3 choices and idle utility updates. Platform acceptance remains pending.

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
