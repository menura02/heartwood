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
3. Keep historical originals under the policy described in [the archive index](docs/archive/README.md). The scope file records the reasons for single-file bilingual content and exceptions for agent instructions, historical material, third-party files, licenses, and generated output.

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

`ci/verify.ts` runs the type check and unit tests, including language selection, catalog keys, named placeholders, and nonempty translations. For changes to terminal interactions, follow [the terminal guide](docs/portfolio/terminal-guide.md) to run the Synapse and PTY checks where supported.
