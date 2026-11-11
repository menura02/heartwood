[English](README.md) | [Türkçe](README.tr.md)

# Heartwood

Heartwood is a privacy-focused TypeScript terminal client for encrypted text chat between two people on the same Matrix homeserver. The portfolio project covers device verification, live chat, message history, a local Synapse lab, and reproducible tests.

Use Node.js 24.20.0 to install the client and open its help from a fresh checkout.

```sh
cd terminal
npm ci
npm start -- --help
```

The terminal interface defaults to English. Use `npm start -- --lang tr --help` to see Turkish help, or set `HEARTWOOD_LANG=tr` for subsequent runs. The `--lang en|tr` flag overrides the environment. Both languages' commands remain available regardless of the interface language. [Installation and local Synapse demo](docs/portfolio/terminal-guide.md)

## Using the client

- `/conversations` lists peers and device trust status. Open a conversation by number with `/chat 1`. Live chat catches up with missed events after reconnecting. Use `/retry` to retry an uncertain send with the original encrypted transaction. [Reliability design](docs/portfolio/reliability-design.md)
- `/history !ROOM` reads the latest page of up to 50 Matrix events from the main prompt. `/older !ROOM` reads an older page for that room. [History commands](docs/portfolio/terminal-guide.md#read-older-messages)
- `/pending` lists rooms with uncertain sends. `/discard` drops local tracking after confirmation. `/identity` displays the account, device and full grouped verification code. [Technical design](docs/portfolio/technical-design.md)

## Testing and distribution

CI runs type checks and unit tests on Windows and Linux. A separate Linux job runs disposable Synapse and real PTY scenarios. [CI workflow](.github/workflows/terminal.yml)

The release workflow runs the same checks on the tagged commit. A passing run prepares a source ZIP, SHA-256 checksum, and bilingual notes for a GitHub draft release. [CI/CD and release procedure](docs/portfolio/ci-cd-guide.md) · [Source package installation](docs/portfolio/distribution.md) · [Changelog](CHANGELOG.md)

Keep real account credentials, keys, user profiles, and private messages out of the repository. [Contributing](CONTRIBUTING.md) · [Documentation archive](docs/archive/README.md)
