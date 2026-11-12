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

## Diagnostics and guided setup

From `terminal/`, run `npm start -- doctor` for local checks, or `npm start -- doctor http://127.0.0.1:18008` to also check the Matrix API. Exit status `0` means the checks passed or reported warnings. Exit status `1` means a check or the invocation failed. Doctor reads directory access information and leaves profiles untouched. Its server check uses the unauthenticated versions endpoint. Device verification is a separate step.

Run `npm start -- onboard` for prompts that collect the account mode, server, profile and username before the normal secret prompts. Press Ctrl+C to cancel. Use `/guide` (or `/rehber`) from the main prompt at any time to see the next step. You can leave with `/exit` while an invitation is pending and return with your usual login.

## Chat commands and local profiles

- Type a command prefix such as `/hist` and press Tab. Matching commands depend on the current prompt. Tab offers command names only. Use `/help` in either prompt.
- In an open chat, use `/history` and then `/older` to read without leaving the live stream. History and live events have separate headings. The main prompt still accepts `/history !ROOM` and `/older !ROOM`.
- Use `/search hello`, `/search-next` and `/search-prev` in an open chat. Search matches literal text in the last 200 eligible messages displayed during this visit, up to 4,000 bytes each. Pages have ten results with UTC times when available. Case matching uses the selected interface language, including Turkish dotted and dotless I. Rerun the search after loading more history or after results leave memory.
- `/conversations` refreshes the current sync and shows a **new activity** marker for observed encrypted events from the peer that have yet to be displayed as readable. Startup and join backfill, your own messages, and recent duplicates are excluded. A bounded indicator can miss events when the server returns a limited sync. It resets on restart and sends no read receipt.
- Use `/status` in an open chat or `/status !ROOM` at the main prompt. It reports the check time, connection, peer and device, verification, room policy, send availability and pending sends separately. Heartwood checks the policy again when sending.
- To send text that starts with a slash, type `/send MESSAGE` in chat. For example, `/send /example` sends the literal text `/example`.

From `terminal/`, run `npm start -- profiles list`, `npm start -- profiles show alice-demo`, or `npm start -- profiles remove alice-demo`. Removal requires typing the exact profile name and rejects active or unsafe profiles. Removing the local keys can make older messages unreadable. The server account and messages remain.

## Run the automated demo

In Linux or WSL with Linux Node.js, set `HEARTWOOD_SYNAPSE_PYTHON` as above. From `terminal/`, run `node lab/demo.ts` or `node lab/demo.ts --lang tr`. The command starts its own disposable lab, drives two real terminals through an encrypted chat and a controlled connection interruption, prints selected terminal output, and shuts down its resources. It uses fictional identities and compares their codes in the harness. Real users compare their codes over a trusted second channel.

## Verify a downloaded ZIP

From the folder containing `heartwood-terminal.zip` and `SHA256SUMS`, run `sha256sum -c SHA256SUMS` on Linux or WSL. In PowerShell use:

```powershell
$actual = (Get-FileHash -LiteralPath heartwood-terminal.zip -Algorithm SHA256).Hash
$expected = ((Get-Content -LiteralPath SHA256SUMS -Raw).Trim() -split '\s+')[0]
if ($actual -ne $expected) { throw 'SHA-256 mismatch' }
```

Extract the ZIP into a new directory and follow [Install](#install). [Architecture](ARCHITECTURE.md) · [Security and limitations](SECURITY.md) · [Changelog](CHANGELOG.md)
