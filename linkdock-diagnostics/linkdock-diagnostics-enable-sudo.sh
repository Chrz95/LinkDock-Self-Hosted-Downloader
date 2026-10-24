#!/bin/sh
# Update the four existing LinkDock launchers to always invoke Docker through sudo.
# Place this file in the extracted linkdock-diagnostics folder, then run:
#   sh linkdock-diagnostics-enable-sudo.sh
# Or specify that folder explicitly:
#   sh linkdock-diagnostics-enable-sudo.sh /path/to/linkdock-diagnostics
set -eu
if [ "$#" -gt 1 ]; then
    printf 'Usage: sh %s [diagnostics-folder]\n' "$0" >&2
    exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
    printf 'Python 3 is required for this updater. No diagnostic files were changed.\n' >&2
    exit 1
fi
if [ "$#" -eq 1 ]; then
    diagnostics_folder=$1
else
    diagnostics_folder=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
fi
python3 - "$diagnostics_folder" <<'LINKDOCK_SUDO_UPDATER'
import os
from pathlib import Path
import stat
import sys
import tempfile

NAMES = [f"linkdock-diagnostic-{kind}.sh" for kind in ("page", "api", "connection", "all")]
MARKER = "# LINKDOCK_ALWAYS_SUDO_V1"
REPLACEMENT = '''
# LINKDOCK_ALWAYS_SUDO_V1
if ! command -v sudo >/dev/null 2>&1; then
    printf 'sudo was not found. Install sudo before running this diagnostic.\\n' >&2
    exit 1
fi
if ! sudo -v; then
    printf 'sudo authorization failed. No diagnostic was started.\\n' >&2
    exit 1
fi
if ! sudo docker info >/dev/null 2>&1; then
    printf 'Cannot access the Docker daemon through sudo. Check that Docker is running.\\n' >&2
    exit 1
fi

docker_command() {
    sudo docker "$@"
}
'''


def temporary_file(folder, data, mode):
    descriptor, name = tempfile.mkstemp(prefix=".linkdock-sudo-", dir=folder)
    try:
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        return Path(name)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        Path(name).unlink(missing_ok=True)
        raise


folder = Path(sys.argv[1]).expanduser().resolve()
planned = []
prepared = []
replaced = []
backed_up = []
try:
    # Validate every input before changing any launcher.
    for name in NAMES:
        filename = folder / name
        if filename.is_symlink() or not filename.is_file():
            raise ValueError(f"Missing regular file: {name}. Extract the original diagnostic ZIP into this folder.")
        original = filename.read_bytes()
        if len(original) > 2 * 1024 * 1024:
            raise ValueError(f"Unexpectedly large launcher: {name}.")
        text = original.decode("utf-8").replace("\r\n", "\n")
        header_end = text.find("\nif ! running=$(docker_command inspect")
        if header_end < 0:
            raise ValueError(f"Unrecognized launcher format: {name}. No files were changed.")
        if MARKER in text[:header_end]:
            print(f"Already uses sudo: {name}")
            continue
        start = text.find("\nneeds_sudo=0\n", 0, header_end)
        if start < 0 or "docker_command()" not in text[start:header_end]:
            raise ValueError(f"Unrecognized sudo handling: {name}. No files were changed.")
        backup = filename.with_name(filename.name + ".before-sudo.bak")
        if backup.exists() or backup.is_symlink():
            raise ValueError(f"Backup already exists: {backup.name}. Keep it safe and use a fresh extracted folder.")
        updated = (text[:start] + REPLACEMENT + text[header_end:]).encode("utf-8")
        mode = stat.S_IMODE(filename.stat().st_mode) & 0o777
        planned.append((filename, original, updated, mode, backup))

    for filename, original, updated, mode, backup in planned:
        prepared.append((filename, temporary_file(folder, updated, mode), original, mode))
    for filename, original, updated, mode, backup in planned:
        descriptor = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        backed_up.append(backup)
        with os.fdopen(descriptor, "wb") as output:
            output.write(original)
            output.flush()
            os.fsync(output.fileno())
    for filename, temporary, original, mode in prepared:
        os.replace(temporary, filename)
        replaced.append((filename, original, mode))
        print(f"Updated: {filename.name}")
    if planned:
        print("All Docker commands in the four launchers now use sudo.")
        print("Originals are saved beside them as *.before-sudo.bak.")
    else:
        print("All four launchers already use sudo. No changes needed.")
except Exception as error:
    rollback_ok = True
    for filename, original, mode in reversed(replaced):
        try:
            os.replace(temporary_file(folder, original, mode), filename)
        except OSError:
            rollback_ok = False
    print(f"Update failed: {error}", file=sys.stderr)
    if replaced:
        print("Original launchers restored." if rollback_ok else
              "Some files could not be restored. Recover them from *.before-sudo.bak.", file=sys.stderr)
    sys.exit(1)
finally:
    for filename, temporary, original, mode in prepared:
        temporary.unlink(missing_ok=True)
LINKDOCK_SUDO_UPDATER
