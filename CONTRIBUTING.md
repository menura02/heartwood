[English](CONTRIBUTING.md) | [Türkçe](CONTRIBUTING.tr.md)

# Contributing to Heartwood

English is the default in the terminal and documentation. Turkish is a fully supported second language. Include both languages whenever you add or change text for users. Write code identifiers, new code comments, developer explanations, and Conventional Commit messages in English. Use the repository's configured Git identity.

## Update terminal text

1. Add or change the same key in `catalog.en` and `catalog.tr` in [the terminal catalog](terminal/src/locale.ts). Use the central translator where the message is displayed. Use the same named placeholders in each edition. The sentence can put them in a different order.
2. Use `{name}` in both templates for a value supplied by the caller. Pass the named argument, for example `translator(language).text('greeting', {name: displayName})` for a new `greeting` key. Insert user messages, names, and room names verbatim. Keep Matrix protocol fields, API keys, database fields, and cryptographic data verbatim.
3. Keep new command names in English and preserve existing Turkish aliases in both interface languages. Preserve machine-readable output and persistent formats. Use [the failure catalog](terminal/src/failures.ts) for localized failure descriptions and keep technical failure codes stable. Use a general localized message for unknown failures and keep raw errors and secrets out of user-facing output.

## Update both document editions

1. Find the pair in [the documentation scope](terminal/ci/document-pairs.json). Use the default `.md` name for English and `.tr.md` for Turkish. Register new current pairs in that file.
2. Put `[English](file.md) | [Türkçe](file.tr.md)` at the top of both files. Keep the technical details, safety boundaries, links, and working commands equivalent. Use actual help output for CLI examples in each language.
3. Keep personal drafts and historical working documents local. The scope file records the reasons for single-file bilingual content and exceptions for agent instructions, historical material, third-party files, licenses, and generated output.

CI checks that required editions and their reciprocal links exist and validates relative Markdown links in the registered current documents. A pull request that changes one edition gets a review warning. Update the counterpart if the meaning changed. For a language-specific correction, explain why it applies to one edition in the pull request. CI cannot establish that the translations convey the same meaning, so review both editions.

## Run the checks

From the repository root, with Node.js 24.20.0 installed, run

```sh
cd terminal
npm ci
node ci/verify.ts
node ci/check-docs.ts
npm start -- --help
npm start -- --lang tr --help
```

`ci/verify.ts` runs the type check and unit tests, including the language checks. For changes to terminal interactions, follow the [lab setup](README.md#try-the-local-lab) to set `HEARTWOOD_SYNAPSE_PYTHON`. From `terminal/`, run `node integration/run-local.ts` on Linux or on Windows with WSL. Run `node integration/run-pty.ts` on Linux or WSL with Node and Python 3.13 or later. The runners start their own labs. Use `python -B ci/test_release.py` to test packaging.

To test native Windows ConPTY, run `node integration/run-pty.ts` from Windows PowerShell with Windows Node.js, native Python 3.12 or later, and the WSL Synapse lab environment above. Set `HEARTWOOD_PTY_PYTHON` to the native Python executable if `python` is unavailable. CI provisions an isolated WSL distribution for the server and uses native Windows Node.js for both clients. The paste scenario sends explicit bracketed paste markers.

## Prepare a release

1. Match the version in `terminal/package.json`, its lockfile, and both changelogs. Merge the PR after the Windows and Ubuntu checks and the Linux Synapse job pass. Confirm that CI passes on the resulting `main` commit. [CI workflow](.github/workflows/terminal.yml)
2. Verify that the matching tag is unused both locally and remotely. Tag the tested commit and push that tag. The release workflow verifies the tag and commit, reruns CI, and prepares a draft with the source ZIP, checksum and bilingual release notes. It stops if a draft or release already exists for that tag. [Release workflow](.github/workflows/release.yml)
3. Review the draft’s commit and notes. Download and [verify the ZIP](README.md#verify-a-downloaded-zip), then install from the extracted package before publishing in GitHub.
