# Heartwood repository instructions

- Use English by default in the terminal and documentation. Turkish is a fully supported second language and part of the definition of done for new features. The terminal chooses `--lang` first, then `HEARTWOOD_LANG`, then English, independent of the operating system language.
- Put all new or changed terminal text for users in the central localization catalogs. Update English and Turkish in the same change with matching named placeholders. Keep unknown failures safe and keep user content, Matrix protocol fields, API keys, database fields, and cryptographic data verbatim.
- Use English names for new commands. Preserve the existing Turkish aliases and their behavior in both interface languages. Keep machine-readable output and persistent formats compatible.
- Write code identifiers, new code comments, developer explanations, and Conventional Commit messages in English. Use the repository's configured Git identity.
- Update both editions of any current document in the same change and keep the reciprocal English and Turkish navigation near the title. Register new pairs and justified exceptions in `terminal/ci/document-pairs.json`. Preserve historical drafts, third-party content, licenses, and generated artifacts according to their documented scope.
- Run the localization and documentation checks in the [contribution guide](CONTRIBUTING.md). Review meaning, command examples, and security boundaries in both languages.
