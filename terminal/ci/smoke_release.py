import argparse
from hashlib import file_digest
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
from tempfile import TemporaryDirectory
from zipfile import BadZipFile, ZipFile

from release import PACKAGE_FILES


MAX_PACKAGE_BYTES = 16 * 1024 * 1024


def verify_checksum(archive):
    if archive.stat().st_size > MAX_PACKAGE_BYTES:
        raise ValueError("Release archive exceeds the compressed size limit.")
    with archive.open("rb") as source:
        digest = file_digest(source, "sha256").hexdigest()
    with archive.with_name("SHA256SUMS").open("rb") as checksums:
        expected = f"{digest}  {archive.name}\n".encode("ascii")
        if checksums.read(len(expected) + 1) != expected:
            raise ValueError("Release archive checksum does not match.")


def extract_package(archive, destination):
    with ZipFile(archive) as package:
        entries = package.infolist()
        # The exact, case-sensitive allowlist also excludes traversal, absolute paths,
        # Windows drive/stream paths and all local developer or profile directories.
        if (len(entries) != len(PACKAGE_FILES)
                or {entry.orig_filename for entry in entries} != set(PACKAGE_FILES)):
            raise ValueError("Unexpected, duplicate or missing release archive contents.")
        if any(entry.is_dir() or entry.filename != entry.orig_filename
               or stat.S_IFMT(entry.external_attr >> 16) not in (0, stat.S_IFREG)
               for entry in entries):
            raise ValueError("Release archive contains a non-regular entry.")
        if sum(entry.file_size for entry in entries) > MAX_PACKAGE_BYTES:
            raise ValueError("Release archive exceeds the uncompressed size limit.")

        destination.mkdir()
        for entry in entries:
            path = destination / entry.filename
            path.parent.mkdir(parents=True, exist_ok=True)
            with package.open(entry) as source, path.open("xb") as target:
                shutil.copyfileobj(source, target)


def run_check(label, command, directory, environment, markers=(), timeout=30):
    try:
        result = subprocess.run(
            command, cwd=directory, env=environment, capture_output=True,
            encoding="utf-8", errors="replace", timeout=timeout,
        )
    except subprocess.TimeoutExpired as error:
        raise ValueError(f"{label} timed out.") from error
    if result.returncode:
        raise ValueError(f"{label} failed (exit {result.returncode}).")
    if any(marker not in result.stdout for marker in markers):
        raise ValueError(f"{label} did not report the expected result.")
    print(f"{label} passed", flush=True)


def isolated_environment(home, directory):
    home.mkdir()
    temporary = directory / "tmp"
    temporary.mkdir()
    excluded = {
        "APPDATA", "LOCALAPPDATA", "NODE_PATH", "NODE_OPTIONS", "HEARTWOOD_LANG",
        "NODE_AUTH_TOKEN", "NPM_TOKEN", "MATRIX_SDK_CRYPTO_DOWNLOADS_BASE_URL",
    }
    environment = {key: value for key, value in os.environ.items()
                   if key.upper() not in excluded and not key.upper().startswith(("NPM_CONFIG_", "GIT_"))}
    environment.update({
        "HOME": str(home), "USERPROFILE": str(home), "APPDATA": str(home), "LOCALAPPDATA": str(home),
        "TMPDIR": str(temporary), "TEMP": str(temporary), "TMP": str(temporary),
        "NPM_CONFIG_CACHE": str(directory / "npm-cache"),
        "NPM_CONFIG_USERCONFIG": str(directory / "user.npmrc"),
        "NPM_CONFIG_GLOBALCONFIG": str(directory / "global.npmrc"),
    })
    return environment


def check_legacy_profile(node, terminal, environment, home):
    # Synthetic metadata matching the previously unversioned format. The marker
    # stands in for an opaque SDK store, without using a user's actual crypto data.
    profile = home / ".heartwood" / "legacy"
    keys = profile / "keys"
    keys.mkdir(parents=True)
    marker = keys / "fixture-marker"
    marker.write_bytes(b"synthetic store fixture")
    device = "9377b734-fc40-4074-82e5-28b7d6a7f657"
    peer = "@bob:example.invalid"
    legacy = {
        "origin": "https://example.invalid",
        "username": "alice",
        "device": device,
        "identity": {"user": "@alice:example.invalid", "device": device, "ed": "fixture", "curve": "fixture"},
        "pins": {peer: {"user": peer, "device": "fixture-device", "ed": "peer-ed", "curve": "peer-curve"}},
        "blocked": ["@blocked:example.invalid"],
        "sync": {"cursor": "fixture-cursor", "invites": [["!fixture:example.invalid", peer]]},
    }
    metadata = profile / "profile.json"
    metadata.write_text(json.dumps(legacy), encoding="utf-8")
    script = (
        "import { Profile } from './src/profile.ts';"
        "const profile = await Profile.open('legacy', 'https://example.invalid', 'alice');"
        "await profile.close();"
    )
    command = [node, "--input-type=module", "--eval", script]
    for label in ("Synthetic legacy profile open", "Migrated profile reopen"):
        run_check(label, command, terminal, environment)
        if json.loads(metadata.read_text(encoding="utf-8")) != {**legacy, "schemaVersion": 1}:
            raise ValueError("Profile migration did not preserve the expected metadata.")
        if marker.read_bytes() != b"synthetic store fixture":
            raise ValueError("Profile migration modified the synthetic SDK store.")


def smoke(archive):
    verify_checksum(archive)
    node = shutil.which("node")
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not node or not npm:
        raise ValueError("The release smoke test requires Node.js and npm on PATH.")

    with TemporaryDirectory(prefix="heartwood-release-") as temporary:
        directory = Path(temporary).resolve()
        if any((parent / name).exists()
               for parent in directory.parents for name in (".git", "node_modules")):
            raise ValueError("Use a temporary directory outside Git checkouts and installed node_modules.")
        extracted = directory / "package"
        extract_package(archive, extracted)
        terminal = extracted / "terminal"
        home = directory / "home"
        environment = isolated_environment(home, directory)
        run_check("npm ci in extracted package", [npm, "ci", "--no-audit", "--no-fund"],
                  terminal, environment, timeout=180)
        for language, usage, crypto, offline in (
            ("en", "Usage:", "The native Matrix binding loads.", "Server omitted."),
            ("tr", "Kullanım:", "Yerel Matrix bağlayıcısı yüklenebiliyor.", "Sunucu verilmedi."),
        ):
            command = [npm, "start", "--", "--lang", language]
            run_check(f"Help ({language})", [*command, "--help"], terminal, environment, (usage,))
            run_check(f"Offline doctor ({language})", [*command, "doctor"], terminal, environment, (crypto, offline))
        if (home / ".heartwood").exists():
            raise ValueError("Help or offline doctor created a profile directory.")
        check_legacy_profile(node, terminal, environment, home)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    try:
        smoke(args.archive.resolve())
    except (ValueError, OSError, BadZipFile, RuntimeError) as error:
        parser.exit(1, f"Release smoke check failed: {error}\n")


if __name__ == "__main__":
    main()
