"""Verify registered browser support without network requests, user config or media downloads."""

import sys


def main():
    """Require a usable Chrome target, not just an importable dependency."""
    try:
        from yt_dlp import YoutubeDL

        with YoutubeDL({"quiet": True, "no_warnings": True, "cachedir": False}) as downloader:
            targets = downloader._get_available_impersonate_targets()
            ready = any(target.client == "chrome" and provider == "curl_cffi" for target, provider in targets)
        if not ready:
            raise RuntimeError()
    except Exception:
        sys.stderr.write("Browser impersonation is unavailable in this media environment.\n")
        return 1
    print("LINKDOCK_MEDIA_BROWSER_READY_V1")
    return 0


if __name__ == "__main__":
    sys.exit(main())
