[English](README.md) | [Türkçe](README.tr.md)

# Heartwood

A privacy-focused TypeScript terminal client for encrypted text chat between two people on the same Matrix homeserver. Heartwood uses device verification and includes a local Synapse lab.

## Install

Use Node.js 24.20.0 on Windows or Linux. From a checkout or extracted source package, run:

```sh
cd terminal
npm ci
npm start -- --help
npm start -- --lang tr --help
```

In PowerShell, use `npm.cmd` if the PowerShell shim is blocked. Installation downloads the Matrix binding for your platform. Local chat can run offline after installation. English is the default. `--lang en|tr` overrides `HEARTWOOD_LANG`, which accepts `en` or `tr`. Existing Turkish command names work in both languages. [Binding and supported platforms](https://github.com/matrix-org/matrix-rust-sdk-crypto-nodejs#usage)

## Try the local lab

In Linux or Ubuntu WSL, install Synapse in an isolated Python environment. Use Python 3.13 or later with `venv` and `curl`. This setup works without `ensurepip`.

```sh
mkdir -p "$HOME/.local/share/heartwood"
python3 -m venv --without-pip "$HOME/.local/share/heartwood/venv"
curl -fsSL https://bootstrap.pypa.io/pip/pip.pyz -o "$HOME/.local/share/heartwood/pip.pyz"
"$HOME/.local/share/heartwood/venv/bin/python" "$HOME/.local/share/heartwood/pip.pyz" install matrix-synapse==1.164.2
```

From `terminal/` on Linux, set `export HEARTWOOD_SYNAPSE_PYTHON="$HOME/.local/share/heartwood/venv/bin/python"` and run `node lab/run.ts 18008`. On Windows, start it from PowerShell in `terminal/`.

```powershell
$linuxHome = (wsl -d Ubuntu --exec printenv HOME).Trim()
$env:HEARTWOOD_SYNAPSE_PYTHON = "$linuxHome/.local/share/heartwood/venv/bin/python"
node lab/run.ts 18008
```

For another WSL distribution, use its name in the command and in `HEARTWOOD_WSL_DISTRO`. Keep the lab window open. The loopback lab shows a registration token valid for 30 minutes and three uses. Ctrl+C stops the lab and removes its disposable server and account files.

1. In separate terminals under `terminal/`, run `npm start -- register alice-demo http://127.0.0.1:18008 alice` and `npm start -- register bob-demo http://127.0.0.1:18008 bob`. Choose fresh profile names for each new lab and enter the token and passwords at the prompts.
2. Alice runs `/invite @bob:localhost`. Bob runs `/requests` and `/accept !ROOM` with the full room ID.
3. Both run `/identity`, compare the complete device codes over a trusted second channel, then run `/verify @user:localhost CODE` with the other person's user ID and code.
4. Run `/conversations`, open the listed chat with `/chat 1`, and type a message. `/back` returns to the main prompt. `/exit` closes the profile. To return while the same lab is running, use `login` with the same profile and account.

Use `/history !ROOM` at the main prompt for the latest page and `/older !ROOM` when more events are available. In live chat, `/refresh` resumes paused reads. Use `/retry` for an uncertain send or `/pending` to list affected rooms. From the main prompt use `/retry !ROOM`. `/discard` drops local tracking after confirmation with `yes` or `evet`. From the main prompt pass the room ID to `/discard`.

## Verify a downloaded ZIP

From the folder containing `heartwood-terminal.zip` and `SHA256SUMS`, run `sha256sum -c SHA256SUMS` on Linux or WSL. In PowerShell use:

```powershell
$actual = (Get-FileHash -LiteralPath heartwood-terminal.zip -Algorithm SHA256).Hash
$expected = ((Get-Content -LiteralPath SHA256SUMS -Raw).Trim() -split '\s+')[0]
if ($actual -ne $expected) { throw 'SHA-256 mismatch' }
```

Extract the ZIP into a new directory and follow [Install](#install). [Architecture](ARCHITECTURE.md) · [Security and limitations](SECURITY.md) · [Changelog](CHANGELOG.md)
