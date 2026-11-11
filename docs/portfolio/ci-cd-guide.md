[English](ci-cd-guide.md) | [Türkçe](ci-cd-guide.tr.md)

# Heartwood CI and releases

## Pull request checks

The terminal workflow runs on branch pushes and pull requests, can run manually, and is reused by the release workflow. It uses Node.js 24.20.0, `npm ci` and a cache keyed to the lockfile. Its pinned actions run with read-only repository contents access and checkout does not persist credentials. The Linux integration job starts a disposable loopback Synapse with fictional accounts and runs the real CLI in POSIX PTYs. [Terminal workflow](../../.github/workflows/terminal.yml)

1. Check that Actions and the workflow's actions are enabled under Settings → Actions → General. Repository visibility, access, and billing depend on the account and organization policies.
2. Open a PR against `main` and inspect the results on the PR's Checks tab or in Actions. Workflow job names include:

   - `Typecheck and unit tests on windows-2025`
   - `Typecheck and unit tests on ubuntu-24.04` (including documentation language pairs and links)
   - `Synapse integration on Linux` (release packaging checks, Synapse, and PTYs)

3. If your repository and plan support rulesets, enable a ruleset targeting `main` under Settings → Rules → Rulesets. Require a pull request and select the status checks as they appear on a successful PR run. If required checks are unavailable, record the manual PR and check procedure. [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)

Run the local type checks and unit tests with `node ci/verify.ts` from `terminal/` after `npm ci`. Run the integration and PTY scenarios in the supported environments described in the terminal guide. Local test results, a successful GitHub run, an active ruleset, and a successful release run each verify a different part of the pipeline. [Terminal setup and tests](terminal-guide.md)

## Prepare a draft release

1. Review the release changes, matching versions in the manifest and lockfile, and the same version in both changelogs. Merge the release PR and identify the passing `main` commit. [English changelog](../../CHANGELOG.md) · [Turkish changelog](../../CHANGELOG.tr.md)
2. Verify that `origin/main` points to the tested commit and that the matching tag is unused. For example, run these checks for version 0.4.0 from the repository root:

   ```sh
   git fetch origin main --tags
   git rev-parse origin/main
   git show origin/main:terminal/package.json
   git tag --list v0.4.0
   git ls-remote --tags origin refs/tags/v0.4.0
   ```

3. Once the commit and version match and both tag lookups return nothing, create and push the tag. Use the actual release version if it differs from the example:

   ```sh
   git tag -a v0.4.0 origin/main -m "Heartwood 0.4.0"
   git push origin refs/tags/v0.4.0
   ```

4. Inspect the draft in GitHub Releases. Confirm its target commit, download both assets, verify the checksum and install from the extracted source before publishing. [Source package installation](distribution.md)

The release workflow verifies the SemVer tag, checkout, package versions and ancestry on `origin/main`. It runs the terminal checks on that same commit, packages only allowlisted sources, and prepares `heartwood-terminal.zip`, `SHA256SUMS`, and bilingual release notes. The workflow retains the transfer artifact for seven days. The final job verifies the tag target and checksum, then creates a draft. SemVer prerelease tags create drafts marked as prereleases. Only this job has `contents: write`, and it runs without checking out project sources. [Release workflow](../../.github/workflows/release.yml)

An existing release or draft for the same tag stops the release job. For an incomplete draft, verify the package and checksum and complete the draft in GitHub, or remove that draft before rerunning. GitHub Releases holds the draft until the maintainer publishes it.
