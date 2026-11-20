from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest
from unittest.mock import patch
import warnings
from zipfile import ZipFile, ZipInfo

from release import PACKAGE_FILES, SEMVER_TAG, build_package, validate_tag, validate_version
from smoke_release import check_installed_runtime, extract_package, isolated_environment, verify_checksum


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        temp = self.enterContext(tempfile.TemporaryDirectory())
        self.root = Path(temp)
        for name in PACKAGE_FILES:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture", encoding="utf-8")
        self.write("terminal/package.json", {"version": "0.3.0"})
        self.write("terminal/package-lock.json", {
            "version": "0.3.0", "packages": {"": {"version": "0.3.0"}},
        })
        (self.root / "CHANGELOG.md").write_text(
            "# Changelog\n\n## 0.3.0\n\n- Test note\n\n## 0.2.0\n\n- Old note\n", encoding="utf-8",
        )
        (self.root / "CHANGELOG.tr.md").write_text(
            "# Değişiklik kaydı\n\n## 0.3.0\n\n- Test notu\n", encoding="utf-8",
        )

    def write(self, name, data):
        (self.root / name).write_text(json.dumps(data), encoding="utf-8")

    def test_package_lists_every_client_source_and_test(self):
        terminal = Path(__file__).resolve().parents[1]
        present = {f"terminal/{path.relative_to(terminal).as_posix()}"
                   for pattern in ("src/*.ts", "test/*.ts") for path in terminal.glob(pattern)}
        self.assertEqual(sorted(present - set(PACKAGE_FILES)), [])

    def test_semver_and_manifest_consistency(self):
        self.assertEqual(validate_version(self.root, "v0.3.0"), "0.3.0")
        self.assertIsNotNone(SEMVER_TAG.fullmatch("v0.3.0-rc.1+build.007"))
        for tag in ["0.3.0", "v00.3.0", "v0.3.0-01", "v0.3.0+", "v0.3.0\n", "v0.3.1"]:
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                validate_version(self.root, tag)
        self.write("terminal/package-lock.json", {
            "version": "0.3.0", "packages": {"": {"version": "0.2.0"}},
        })
        with self.assertRaisesRegex(ValueError, "versions"):
            validate_version(self.root, "v0.3.0")

    @patch("release.git")
    def test_tag_targets_expected_commit_on_main(self, git):
        commit = "a" * 40
        git.side_effect = [commit, commit, ""]
        validate_tag(self.root, "v0.3.0", commit)
        git.assert_called_with(self.root, "merge-base", "--is-ancestor", commit, "refs/remotes/origin/main")
        for refs in [[commit, "b" * 40], [commit, commit, ValueError("not on main")]]:
            git.side_effect = refs
            with self.assertRaises(ValueError):
                validate_tag(self.root, "v0.3.0", commit)

    def test_package_has_exact_files_notes_and_checksum(self):
        excluded = (".git/config", "terminal/.lab/token", "terminal/.heartwood/profile",
                    "terminal/node_modules/x", "docs/pilot/old",
                    "docs/portfolio/distribution.md", "docs/archive/2026-11-11-ci-cd-handoff.tr.md")
        for name in excluded:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("excluded", encoding="utf-8")
        output = self.root / "out"
        build_package(self.root, "v0.3.0", output)
        archive = output / "heartwood-terminal.zip"
        with ZipFile(archive) as package:
            self.assertEqual(sorted(package.namelist()), sorted(PACKAGE_FILES))
            self.assertTrue({"README.md", "README.tr.md", "ARCHITECTURE.md", "ARCHITECTURE.tr.md",
                             "SECURITY.md", "SECURITY.tr.md"}.issubset(package.namelist()))
            self.assertTrue(set(excluded).isdisjoint(package.namelist()))
            self.assertIsNone(package.testzip())
        self.assertEqual((output / "SHA256SUMS").read_text().split(),
                         [sha256(archive.read_bytes()).hexdigest(), archive.name])
        self.assertEqual((output / "release-notes.md").read_text(encoding="utf-8"),
                         "## English\n\n- Test note\n\n## Türkçe\n\n- Test notu\n")
        with self.assertRaises(FileExistsError):
            build_package(self.root, "v0.3.0", output)

    def test_package_stops_on_missing_notes_or_source(self):
        (self.root / "CHANGELOG.md").write_text("## 0.2.0\nOld", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "CHANGELOG"):
            build_package(self.root, "v0.3.0", self.root / "out")
        (self.root / "CHANGELOG.md").write_text("## 0.3.0\nNotes", encoding="utf-8")
        (self.root / "CHANGELOG.tr.md").write_text("## 0.2.0\nOld", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "CHANGELOG.tr.md"):
            build_package(self.root, "v0.3.0", self.root / "out")
        (self.root / "CHANGELOG.tr.md").write_text("## 0.3.0\nNotlar", encoding="utf-8")
        (self.root / "terminal/src/cli.ts").unlink()
        with self.assertRaisesRegex(ValueError, "cli.ts"):
            build_package(self.root, "v0.3.0", self.root / "out")

    def test_smoke_verifies_and_extracts_real_package(self):
        output = self.root / "out"
        build_package(self.root, "v0.3.0", output)
        archive = output / "heartwood-terminal.zip"
        verify_checksum(archive)
        destination = self.root / "extracted"
        extract_package(archive, destination)
        self.assertEqual(sorted(path.relative_to(destination).as_posix()
                                for path in destination.rglob("*") if path.is_file()),
                         sorted(PACKAGE_FILES))
        (output / "SHA256SUMS").write_text("incorrect", encoding="ascii")
        with self.assertRaisesRegex(ValueError, "checksum"):
            verify_checksum(archive)

    def test_runtime_smoke_detects_a_missing_client_only_module(self):
        node = shutil.which("node")
        npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
        self.assertTrue(node and npm, "The package runtime test requires Node.js and npm on PATH.")
        self.write("terminal/package.json", {
            "version": "0.3.0", "type": "module", "scripts": {"start": "node src/cli.ts"},
        })
        (self.root / "terminal/src/cli.ts").write_text(
            "const turkish = process.argv.includes('tr');\n"
            "if (process.argv.includes('--help')) console.log(turkish ? 'Kullanım:' : 'Usage:');\n"
            "else console.log(turkish ? 'Yerel Matrix bağlayıcısı yüklenebiliyor. Sunucu verilmedi.' "
            ": 'The native Matrix binding loads. Server omitted.');\n",
            encoding="utf-8",
        )
        client_dependency = "terminal/src/client-runtime-fixture.ts"
        (self.root / client_dependency).write_text("export {};", encoding="utf-8")
        (self.root / "terminal/src/client.ts").write_text(
            "import './client-runtime-fixture.ts'; export class Heartwood {};", encoding="utf-8",
        )
        environment = isolated_environment(self.root / "home", self.root)
        for description, files in (("complete", (*PACKAGE_FILES, client_dependency)), ("omitted", PACKAGE_FILES)):
            with self.subTest(package=description):
                output = self.root / description
                extracted = self.root / f"extracted-{description}"
                with patch("release.PACKAGE_FILES", files), patch("smoke_release.PACKAGE_FILES", files):
                    build_package(self.root, "v0.3.0", output)
                    archive = output / "heartwood-terminal.zip"
                    verify_checksum(archive)
                    extract_package(archive, extracted)
                terminal = extracted / "terminal"
                if description == "complete":
                    check_installed_runtime(node, npm, terminal, environment)
                else:
                    with self.assertRaisesRegex(ValueError, "Client module import failed"):
                        check_installed_runtime(node, npm, terminal, environment)

    def test_smoke_rejects_unsafe_or_unexpected_entries_before_extracting(self):
        symlink = ZipInfo("terminal/src/cli.ts")
        symlink.create_system = 3
        symlink.external_attr = (stat.S_IFLNK | 0o777) << 16
        for bad_entry in ["../outside", "/absolute", "C:/outside", "terminal\\src\\cli.ts",
                          ".git/config", "terminal/.lab/token", "terminal/.heartwood/profile",
                          "terminal/node_modules/x", "terminal/src/CLI.ts", "terminal/src/cli.ts",
                          symlink]:
            with self.subTest(entry=bad_entry):
                archive = self.root / "crafted.zip"
                with ZipFile(archive, "w") as package, warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    for name in PACKAGE_FILES:
                        if name != getattr(bad_entry, "filename", None):
                            package.writestr(name, "fixture")
                    package.writestr(bad_entry, "unexpected")
                destination = self.root / "extracted"
                with self.assertRaises(ValueError):
                    extract_package(archive, destination)
                self.assertFalse(destination.exists())

    def test_smoke_rejects_missing_or_oversized_entries(self):
        archive = self.root / "crafted.zip"
        with ZipFile(archive, "w") as package:
            package.writestr(PACKAGE_FILES[0], "incomplete")
        destination = self.root / "extracted"
        with self.assertRaisesRegex(ValueError, "contents"):
            extract_package(archive, destination)
        with ZipFile(archive, "w") as package:
            for name in PACKAGE_FILES:
                package.writestr(name, "fixture")
        with patch("smoke_release.MAX_PACKAGE_BYTES", 5), self.assertRaisesRegex(ValueError, "size"):
            extract_package(archive, destination)
        self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
