#!/bin/sh
# Self-contained LinkDock diagnostic launcher. No separate .mjs file is needed.
# Usage: sh SCRIPT.sh [container-name]
# Optional: LINKDOCK_CONTAINER=another_name sh SCRIPT.sh
set -eu

if [ "$#" -gt 1 ]; then
    printf 'Usage: sh %s [container-name]\n' "$0" >&2
    exit 2
fi
container=${1:-${LINKDOCK_CONTAINER:-link_dock}}
case "$container" in
    ''|-*|*[!A-Za-z0-9_.-]*)
        printf 'Enter a valid Docker container name or ID.\n' >&2
        exit 2
        ;;
esac
if ! command -v docker >/dev/null 2>&1; then
    printf 'Docker was not found. Run this script on the Pi hosting LinkDock.\n' >&2
    exit 1
fi
needs_sudo=0
if ! docker info >/dev/null 2>&1; then
    if ! command -v sudo >/dev/null 2>&1; then
        printf 'Cannot access Docker. Start Docker or run this script with appropriate permissions.\n' >&2
        exit 1
    fi
    printf 'Docker needs elevated access; sudo may ask for your password.\n' >&2
    if ! sudo -v || ! sudo docker info >/dev/null 2>&1; then
        printf 'Cannot access the Docker daemon. Check that Docker is running.\n' >&2
        exit 1
    fi
    needs_sudo=1
fi

docker_command() {
    if [ "$needs_sudo" -eq 1 ]; then
        sudo docker "$@"
    else
        docker "$@"
    fi
}
if ! running=$(docker_command inspect --type container --format '{{.State.Running}}' "$container" 2>/dev/null); then
    printf 'Container "%s" was not found or is inaccessible.\n' "$container" >&2
    exit 1
fi
if [ "$running" != true ]; then
    printf 'Container "%s" is stopped. Start it, then rerun this script.\n' "$container" >&2
    exit 1
fi

run_api() {
    printf '\nRunning LD-DA-API-2 in %s…\n' "$container" >&2
    docker_command exec -i -w /app "$container" node --input-type=module <<'LINKDOCK_API_DIAGNOSTIC_JS'
/** Read-only LinkDock 2.25 API diagnostic: cached access only, no token exchange or media downloads. */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export const pythonProbe = String.raw`
import contextlib, io, json, logging, pickletools, re, sqlite3, sys, time, uuid
from pathlib import Path
from urllib.parse import urljoin, urlparse

LIMIT = 4 * 1024 * 1024
TARGET = "https://www.deviantart.com/avagreenwood/art/Shrunken-Class-Pet%3A-Chapter-77-1398120121"
SHORT = "https://www.deviantart.com/avagreenwood/art/1398120121"

class Sink:
    def write(self, value):
        return len(value)
    def flush(self):
        pass

def page_markers(page):
    from gallery_dl import text
    escaped_uuid = text.extr(page, '\"deviationUuid\\\":\\\"', '\\')
    plain_uuid = re.search(r'"deviationUuid"\s*:\s*"([a-fA-F0-9-]{36})"', page)
    return {
        "extractor_uuid_marker": bool(escaped_uuid),
        "plain_uuid_marker": bool(plain_uuid),
        "expected_item_id_marker": bool(re.search(r'(?<!\d)1398120121(?!\d)', page)),
        "cloudfront_block_marker": "Request blocked." in page or "The request could not be satisfied" in page,
        "captcha_marker": bool(re.search(r'captcha|cf-chl-|turnstile', page, re.I)),
        "password_input_marker": bool(re.search(r'<input\b[^>]*type=[\"\x27]password', page, re.I)),
    }

def probe_page(session, label, url, cookies):
    session.cookies.clear()
    from gallery_dl import util
    for cookie in util.cookiestxt_load(io.StringIO(cookies)) if cookies else ():
        session.cookies.set_cookie(cookie)
    result = {"variant": label, "redirects": 0}
    for step in range(3):
        target = urlparse(url)
        if target.scheme != "https" or target.hostname != "www.deviantart.com" or target.port not in (None, 443):
            result["stopped"] = "redirect_outside_source"
            return result
        if target.username or target.password:
            result["stopped"] = "invalid_redirect"
            return result
        if step:
            time.sleep(2)
        with session.get(url, timeout=(8, 8), allow_redirects=False, stream=True) as response:
            result["http_status"] = response.status_code
            result["final_route"] = "login" if "/login" in target.path else "art" if "/art/" in target.path else "other"
            content_type = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
            result["html_response"] = content_type == "text/html"
            if 300 <= response.status_code < 400 and response.headers.get("Location"):
                url = urljoin(url, response.headers["Location"])
                result["redirects"] += 1
                continue
            body = bytearray()
            truncated = False
            for chunk in response.iter_content(16384):
                if len(body) + len(chunk) > LIMIT:
                    truncated = True
                    body.extend(chunk[:LIMIT-len(body)])
                    break
                body.extend(chunk)
            result["body_truncated"] = truncated
            result["body_bytes_checked"] = len(body)
            page = body.decode("utf-8", "replace")
            result.update(page_markers(page))
            from gallery_dl import text
            value = text.extr(page, '\"deviationUuid\\\":\\\"', '\\')
            try:
                result["_uuid"] = str(uuid.UUID(value))
            except (ValueError, AttributeError):
                pass
            return result
    result["stopped"] = "redirect_limit"
    return result

def cached_token(payload):
    if not payload.get("cacheFile") or not payload.get("cacheKey"):
        return None, "account_or_cache_unavailable"
    try:
        uri = Path(payload["cacheFile"]).as_uri() + "?mode=ro"
        with sqlite3.connect(uri, uri=True, timeout=2) as database:
            row = database.execute("SELECT value, expires FROM data WHERE key=? LIMIT 1",
                                   (payload["cacheKey"],)).fetchone()
        if not row:
            return None, "private_access_token_not_cached"
        if row[1] and row[1] <= time.time():
            return None, "cached_access_token_expired"
        if not isinstance(row[0], bytes) or len(row[0]) > 65536:
            return None, "unsupported_cache_format"
        # Inspect primitive pickle opcodes; never execute pickle.loads on credential storage.
        allowed = {"PROTO", "FRAME", "SHORT_BINUNICODE", "BINUNICODE", "BINUNICODE8", "UNICODE",
                   "MEMOIZE", "BINPUT", "LONG_BINPUT", "STOP"}
        strings = []
        stopped = False
        for opcode, argument, position in pickletools.genops(row[0]):
            if opcode.name not in allowed:
                return None, "unsupported_cache_format"
            if opcode.name in {"SHORT_BINUNICODE", "BINUNICODE", "BINUNICODE8", "UNICODE"}:
                strings.append(argument)
            if opcode.name == "STOP":
                stopped = position == len(row[0]) - 1
        if not stopped or len(strings) != 1 or not re.fullmatch(r"Bearer [A-Za-z0-9._~+/-]+=*", strings[0]):
            return None, "unsupported_cache_format"
        return strings[0], "available"
    except Exception:
        return None, "private_cache_unreadable"

def api_probe(session, label, endpoint, token, item_uuid):
    result = {"endpoint": label}
    try:
        with session.get("https://www.deviantart.com/api/v1/oauth2/" + endpoint,
                         headers={"Authorization": token, "dA-minor-version": "20210526"},
                         timeout=(8, 8), allow_redirects=False, stream=True) as response:
            result["http_status"] = response.status_code
            if 300 <= response.status_code < 400:
                result["stopped"] = "api_redirect_not_followed"
                return result
            body = bytearray()
            for chunk in response.iter_content(16384):
                if len(body) + len(chunk) > 524288:
                    result["stopped"] = "api_body_limit"
                    return result
                body.extend(chunk)
            try:
                data = json.loads(body)
            except Exception:
                result["response"] = "non_json"
                return result
            if not isinstance(data, dict):
                result["response"] = "unexpected_json_type"
                return result
            result["response"] = "json_object"
            errors = {"invalid_request", "invalid_token", "insufficient_scope", "access_denied",
                      "application_api_threshold", "invalid_grant", "invalid_client"}
            if data.get("error"):
                result["error"] = data["error"] if data["error"] in errors else "other_provider_error"
            descriptions = {
                "User not found.": "user_not_found", "Account is inactive.": "account_inactive",
                "Deviation not downloadable.": "deviation_not_downloadable",
                "Only subscribers may have access to this download.": "subscriber_access_required",
                "Api endpoint not found.": "api_endpoint_not_found",
                "Free download limit reached.": "download_limit_reached",
            }
            if data.get("error_description"):
                result["error_description_category"] = descriptions.get(data["error_description"], "other")
            result["has_user_object"] = isinstance(data.get("user"), dict)
            result["has_deviation_identifier"] = isinstance(data.get("deviationid"), str)
            result["matches_page_uuid"] = str(data.get("deviationid", "")).lower() == item_uuid.lower()
            if isinstance(data.get("is_deleted"), bool):
                result["is_deleted"] = data["is_deleted"]
    except Exception:
        result["error"] = "api_request_failed"
    return result

def run(payload):
    from gallery_dl import config, extractor, util, version
    logging.disable(logging.CRITICAL)
    config.set(("extractor",), "proxy", payload["proxy"])
    config.set(("extractor",), "cookies-update", False)
    config.set(("extractor",), "input", False)
    if payload["userAgent"]:
        config.set(("extractor",), "user-agent", payload["userAgent"])
    instance = extractor.find(TARGET)
    if instance is None or instance.category != "deviantart":
        return {"diagnostic": "LD-DA-API-2", "error": "extractor_unavailable"}
    instance.initialize()
    instance.session.proxies = instance._proxies
    instance.session.trust_env = False
    # initialize creates the HTTP session; items()/login()/OAuth APIs are deliberately never called.
    cookies = list(util.cookiestxt_load(io.StringIO(payload["cookies"]))) if payload["cookies"] else []
    now = time.time()
    active = {cookie.name for cookie in cookies if not cookie.expires or cookie.expires > now}
    engine_version = str(version.__version__)
    report = {
        "diagnostic": "LD-DA-API-2",
        "gallery_dl_version": engine_version if re.fullmatch(r'[0-9A-Za-z.+_-]{1,50}', engine_version) else "unknown",
        "cookie_source": payload["cookieSource"],
        "cookie_count": len(cookies),
        "required_cookie_names_present_unexpired": {name: name in active for name in ("auth", "auth_secure", "userinfo")},
        "matching_user_agent_saved": bool(payload["userAgent"]),
        "requests": [],
    }
    item_uuid = None
    try:
        for label, url in (("original", TARGET), ("id_only", SHORT)):
            try:
                item = probe_page(instance.session, label, url, payload["cookies"])
            except Exception as error:
                allowed = {"Timeout", "ReadTimeout", "ConnectTimeout", "ProxyError", "SSLError", "ConnectionError"}
                name = type(error).__name__
                item = {"variant": label, "error": name if name in allowed else "request_failed"}
            item_uuid = item.pop("_uuid", None) or item_uuid
            report["requests"].append(item)
            if item.get("http_status") == 429:
                report["stopped"] = "rate_limited"
                break
            if label == "original":
                time.sleep(2)
        token, cache_status = cached_token(payload)
        report["private_access_token_cache"] = cache_status
        report["api_requests"] = []
        if token and item_uuid and not report.get("stopped"):
            for label, endpoint in (("author_profile", "user/profile/avagreenwood"),
                                    ("deviation", "deviation/" + item_uuid)):
                time.sleep(2)
                result = api_probe(instance.session, label, endpoint, token, item_uuid)
                report["api_requests"].append(result)
                if result.get("http_status") in (401, 429):
                    report["api_stopped"] = "token_rejected" if result["http_status"] == 401 else "rate_limited"
                    break
        elif not item_uuid:
            report["api_stopped"] = "page_uuid_unavailable"
    finally:
        instance.session.close()
    return report

if __name__ == "__main__":
    try:
        payload = json.load(sys.stdin)
        with contextlib.redirect_stdout(Sink()), contextlib.redirect_stderr(Sink()):
            report = run(payload)
    except Exception:
        report = {"diagnostic": "LD-DA-API-2", "error": "probe_initialization_failed"}
    print(json.dumps(report))
`;

/** Locates the active gallery-dl interpreter, so managed updates use their own Python environment. */
function interpreter(command) {
  const candidates = path.isAbsolute(command) ? [command]
    : (process.env.PATH ?? '').split(path.delimiter).map((directory) => path.join(directory, command));
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error('gallery-dl unavailable');
  const firstLine = readFileSync(executable, 'utf8').split('\n')[0];
  const match = /^#!(\/[^\s]+python[\d.]*)\s*$/u.exec(firstLine);
  if (!match || !existsSync(match[1])) throw new Error('Python interpreter unavailable');
  return match[1];
}

/** Runs the read-only probe in an installed LinkDock container. */
export async function main() {
  let proxy;
  try {
    const root = '/app/dist-server/server';
    const moduleAt = (relative) => import(pathToFileURL(path.join(root, relative)).href);
    const [{ BrowserAccessStore }, { cookiesForSource, sessionUserAgent }, { resolveUtility }, { createPublicProxy }] =
      await Promise.all([
        moduleAt('browserAccess/store.js'), moduleAt('browserAccess/sessions.js'),
        moduleAt('utilities/resolve.js'), moduleAt('engines/publicProxy.js'),
      ]);
    const target = 'https://www.deviantart.com/avagreenwood/art/Shrunken-Class-Pet%3A-Chapter-77-1398120121';
    const dataDirectory = process.env.DATA_DIRECTORY || '/data';
    const state = new BrowserAccessStore(dataDirectory).read();
    let cookies = cookiesForSource(state, target);
    let cookieSource = cookies ? 'imported' : 'none';
    if (!cookies && process.env.MEDIA_COOKIES_FILE) {
      const mounted = readFileSync(process.env.MEDIA_COOKIES_FILE);
      if (mounted.byteLength > 262144) throw new Error('Mounted cookie limit exceeded');
      cookies = mounted.toString('utf8');
      cookieSource = 'mounted';
    }
    const tool = resolveUtility('instagram', dataDirectory);
    const python = interpreter(tool.command);
    const configuredDnsMode = process.env.MEDIA_DNS_MODE || 'system';
    proxy = await createPublicProxy({ dnsMode: configuredDnsMode });
    await new Promise((resolve, reject) => {
      const child = spawn(python, ['-c', pythonProbe], { stdio: ['pipe', 'pipe', 'ignore'], env: tool.environment });
      let output = '';
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 95000);
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.length > 65536) child.kill('SIGKILL');
      });
      child.stdin.on('error', () => {});
      child.once('error', () => { clearTimeout(timer); reject(new Error('Probe unavailable')); });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 || timedOut) {
          process.stdout.write(JSON.stringify({ diagnostic: 'LD-DA-API-2', error: timedOut ? 'timeout' : 'probe_failed' }) + '\n');
          resolve();
          return;
        }
        try {
          const report = JSON.parse(output);
          if (report.diagnostic !== 'LD-DA-API-2') throw new Error('Invalid probe');
          report.configured_media_dns_mode = configuredDnsMode;
          process.stdout.write(JSON.stringify(report, null, 2) + '\n');
          resolve();
        } catch { reject(new Error('Invalid probe')); }
      });
      let cacheFile;
      let cacheKey;
      // Read existing private state without constructing a store that chmods it or creates directories.
      try {
        const credentials = JSON.parse(readFileSync(path.join(dataDirectory, 'credentials/deviantart/settings.json'), 'utf8'));
        const account = credentials.account;
        if (/^[a-f0-9-]{36}$/u.test(account?.id ?? '') && typeof account.refreshToken === 'string') {
          cacheFile = path.resolve(dataDirectory, 'credentials/deviantart', account.id, 'cache.sqlite3');
          cacheKey = 'gallery_dl.extractor.deviantart._authenticate_impl-' + account.refreshToken;
        }
      } catch { /* Missing saved OAuth state is reported without exposing private parse errors. */ }
      child.stdin.end(JSON.stringify({
        cacheFile, cacheKey,
        proxy: proxy.url, cookies: cookies || '', cookieSource, userAgent: sessionUserAgent(state, target),
      }));
    });
  } catch {
    process.stdout.write(JSON.stringify({ diagnostic: 'LD-DA-API-2', error: 'station_setup_unavailable' }) + '\n');
    process.exitCode = 1;
  } finally {
    proxy?.close();
  }
}
if (process.env.LINKDOCK_DIAGNOSTIC_TEST !== '1') await main();
LINKDOCK_API_DIAGNOSTIC_JS
}

run_api
