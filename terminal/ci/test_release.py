from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

from release import PACKAGE_FILES, SEMVER_TAG, build_package, validate_tag, validate_version


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


if __name__ == "__main__":
    unittest.main()
