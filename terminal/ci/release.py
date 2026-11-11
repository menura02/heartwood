import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
from zipfile import ZIP_DEFLATED, ZipFile


PACKAGE_FILES = (
    "CHANGELOG.md",
    "CHANGELOG.tr.md",
    "docs/portfolio/distribution.md",
    "docs/portfolio/distribution.tr.md",
    "docs/portfolio/technical-design.md",
    "docs/portfolio/technical-design.tr.md",
    "terminal/package.json",
    "terminal/package-lock.json",
    "terminal/tsconfig.json",
    "terminal/ci/verify.ts",
    "terminal/integration/profile-worker.ts",
    "terminal/integration/run-local.ts",
    "terminal/integration/run-pty.ts",
    "terminal/integration/synapse.test.ts",
    "terminal/integration/terminal-pty.py",
    "terminal/lab/homeserver.yaml",
    "terminal/lab/log.yaml",
    "terminal/lab/messages.ts",
    "terminal/lab/registration-token.ts",
    "terminal/lab/run.ts",
    "terminal/lab/supervise.py",
    "terminal/src/chat-feed.ts",
    "terminal/src/cli.ts",
    "terminal/src/client.ts",
    "terminal/src/commands.ts",
    "terminal/src/connection.ts",
    "terminal/src/conversation-list.ts",
    "terminal/src/failures.ts",
    "terminal/src/history-navigation.ts",
    "terminal/src/history.ts",
    "terminal/src/live-timeline.ts",
    "terminal/src/locale.ts",
    "terminal/src/matrix.ts",
    "terminal/src/policy.ts",
    "terminal/src/profile-lock.ts",
    "terminal/src/profile.ts",
    "terminal/src/send-attempts.ts",
    "terminal/src/terminal-input.ts",
    "terminal/test/chat.test.ts",
    "terminal/test/connection.test.ts",
    "terminal/test/conversation-list.test.ts",
    "terminal/test/history-navigation.test.ts",
    "terminal/test/history.test.ts",
    "terminal/test/lab.test.ts",
    "terminal/test/live-timeline.test.ts",
    "terminal/test/locale.test.ts",
    "terminal/test/policy.test.ts",
    "terminal/test/profile-recovery.test.ts",
    "terminal/test/profile.test.ts",
    "terminal/test/send-attempts.test.ts",
    "terminal/test/terminal-input.test.ts",
)
NUMBER = r"(?:0|[1-9][0-9]*)"
PRERELEASE = rf"(?:{NUMBER}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
BUILD = r"[0-9A-Za-z-]+"
SEMVER_TAG = re.compile(
    rf"v({NUMBER}\.{NUMBER}\.{NUMBER}"
    rf"(?:-{PRERELEASE}(?:\.{PRERELEASE})*)?"
    rf"(?:\+{BUILD}(?:\.{BUILD})*)?)"
)


def package_file(root, name):
    path = root / name
    if not path.is_file() or path.resolve() != path:
        raise ValueError(f"Missing or non-regular package file: {name}")
    return path


def validate_version(root, tag):
    match = SEMVER_TAG.fullmatch(tag)
    if not match:
        raise ValueError("The release tag must be v followed by valid SemVer.")
    version = match.group(1)
    manifest = json.loads(package_file(root, "terminal/package.json").read_text(encoding="utf-8"))
    lock = json.loads(package_file(root, "terminal/package-lock.json").read_text(encoding="utf-8"))
    versions = (manifest.get("version"), lock.get("version"), lock.get("packages", {}).get("", {}).get("version"))
    if any(value != version for value in versions):
        raise ValueError("Tag, package.json and package-lock.json versions must match.")
    return version


def git(root, *arguments):
    result = subprocess.run(["git", *arguments], cwd=root, text=True, capture_output=True)
    if result.returncode:
        raise ValueError(f"Git check failed: {' '.join(arguments)}")
    return result.stdout.strip()


def validate_tag(root, tag, expected_commit):
    validate_version(root, tag)
    if not re.fullmatch(r"[0-9a-f]{40}", expected_commit):
        raise ValueError("Expected a full commit SHA.")
    tag_commit = git(root, "rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}")
    if git(root, "rev-parse", "HEAD") != expected_commit or tag_commit != expected_commit:
        raise ValueError("The tag and checkout must resolve to the triggering commit.")
    git(root, "merge-base", "--is-ancestor", expected_commit, "refs/remotes/origin/main")


def release_notes(root, path, version):
    changelog = package_file(root, path).read_text(encoding="utf-8")
    sections = re.split(r"^## ", changelog, flags=re.MULTILINE)[1:]
    notes = [body.strip() for section in sections
             for heading, _, body in [section.partition("\n")] if heading.strip() == version]
    if len(notes) != 1 or not notes[0]:
        raise ValueError(f"{path} must contain exactly one nonempty section for this version.")
    return notes[0]


def build_package(root, tag, output):
    version = validate_version(root, tag)
    english = release_notes(root, "CHANGELOG.md", version)
    turkish = release_notes(root, "CHANGELOG.tr.md", version)
    files = [(name, package_file(root, name)) for name in PACKAGE_FILES]
    output.mkdir()
    archive = output / "heartwood-terminal.zip"
    with ZipFile(archive, "x", compression=ZIP_DEFLATED) as package:
        for name, path in files:
            package.write(path, name)
    checksum = sha256(archive.read_bytes()).hexdigest()
    (output / "SHA256SUMS").write_bytes(f"{checksum}  {archive.name}\n".encode("ascii"))
    (output / "release-notes.md").write_text(
        f"## English\n\n{english}\n\n## Türkçe\n\n{turkish}\n", encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate")
    validate.add_argument("tag")
    validate.add_argument("commit")
    package = commands.add_parser("package")
    package.add_argument("tag")
    package.add_argument("output", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    try:
        if args.command == "validate":
            validate_tag(root, args.tag, args.commit)
        else:
            build_package(root, args.tag, args.output)
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
