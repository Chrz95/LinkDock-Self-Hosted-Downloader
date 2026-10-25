#!/bin/sh
# Reports active engine metadata only. Does not fetch source pages, download media or update tools.
set -eu
container=${1:-link_dock}
case "$container" in
  ''|-*|*[!a-zA-Z0-9_.-]*) printf '%s\n' 'Enter a valid container name.' >&2; exit 1 ;;
esac
sudo docker exec -i -w /app "$container" node --input-type=module <<'LINKDOCK_VIDEO_CHECK'
import { loadServerConfig } from './dist-server/server/config.js';
import { resolveUtility } from './dist-server/server/utilities/resolve.js';
import { spawnSync } from 'node:child_process';

const config = loadServerConfig();
const tool = resolveUtility('video', config.dataDirectory, config.runtimeEnvironment);
function probe(flag) {
  return spawnSync(tool.command, ['--ignore-config', '--no-plugin-dirs', '--no-colors', flag], {
    env: tool.environment, encoding: 'utf8', timeout: 15000, maxBuffer: 65536,
  });
}
const version = probe('--version');
const targets = probe('--list-impersonate-targets');
const rows = (targets.stdout ?? '').split(/\r?\n/u).map((line) => line.trim()).filter((line) =>
  /^(?:Chrome|Edge|Firefox|Safari|Tor)(?:-|\s)/u.test(line) && /^[A-Za-z0-9_. ()>=-]+$/u.test(line),
);
const label = (version.stdout ?? '').trim();
const ready = targets.status === 0 && rows.some((row) => /curl_cffi/u.test(row) && !/unavailable/iu.test(row));
console.log(JSON.stringify({
  diagnostic: 'LD-VIDEO-ENV-2',
  yt_dlp_version: version.status === 0 && /^[0-9][A-Za-z0-9_.+-]{0,159}$/u.test(label) ? label : 'unavailable',
  impersonation_check_passed: targets.status === 0,
  browser_support_available: ready,
  targets: rows,
}, null, 2));
process.exitCode = ready ? 0 : 1;
LINKDOCK_VIDEO_CHECK
