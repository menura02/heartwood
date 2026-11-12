[English](CHANGELOG.md) | [Türkçe](CHANGELOG.tr.md)

# Changelog

## 0.5.0

### Added

- Run `doctor` to check the runtime, native crypto binding, profile directory access, and optional Matrix connectivity.
- Run `onboard` for guided registration or login, and `/guide` to see the next chat setup step.
- Run the disposable two-account demo on Linux or WSL for encrypted chat and reconnection.
- Added Windows ConPTY coverage and expanded tests for temporary failures, expired tokens and changed device keys.

## 0.4.0

### Added

- The terminal client and local Synapse lab offer English and Turkish interfaces. English is the default. The `--lang en|tr` flag takes precedence over the `HEARTWOOD_LANG` environment variable.
- Added English `register` and `login` startup commands and English interactive commands.
- Current documentation and the source package installation guide are available in both languages. GitHub draft releases contain English and Turkish release notes.

### Compatibility

- Existing Turkish startup and interactive commands work in both interface languages. Set the language explicitly in scripts that match terminal output.

## 0.3.0

_English translation of the original Turkish entry._

### Added

- Live chat shows connection and history catch-up status. It retries transient connection failures for a limited time. Use `/yenile` to resume manually.
- `/bekleyenler` shows room IDs for uncertain sends. `/vazgec` drops local tracking after explicit confirmation. The message may have reached the server. `/tekrar` uses the original transaction ID and encrypted payload.
- Added Windows and Linux type checks and unit tests, plus separate Synapse and POSIX PTY steps on Linux.

### Fixed

- Secret input stays hidden. Incoming notifications preserve the draft. Multiline paste identified by the terminal is rejected in full.
- Ctrl+C and normal exit release the terminal and profile lock. Exit aborts an in-flight live HTTP request.

### Compatibility

- Existing profiles and ungrouped 64-character device codes remain supported. `/kimlik` now displays the account, device and full code in eight groups. Scripts that parse the output need to account for the new format.

### Known limitations

- Pending sends are held in process memory. Unframed paste is indistinguishable from sequential keystrokes.
- The real PTY test runs on Linux and WSL. Native Windows PTY behavior was outside that test's coverage.
