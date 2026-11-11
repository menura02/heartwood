[English](terminal-guide.md) | [Türkçe](terminal-guide.tr.md)

# Heartwood terminal setup and demo

## Client

Use Node.js 24.20.0 and its bundled npm for a reproducible installation. Start in `terminal/` in a Windows or Linux checkout.

```sh
npm ci
npm start -- --lang en --help
```

Installation downloads the official Matrix binding binary for your platform from GitHub Releases. Once installed, local chat works without internet access. [Supported platforms](https://github.com/matrix-org/matrix-rust-sdk-crypto-nodejs#usage)

English is the default for the client and lab. Set `HEARTWOOD_LANG=tr` to use Turkish by default, or pass `--lang en` or `--lang tr` to override the environment for a single run. In PowerShell use `$env:HEARTWOOD_LANG = 'tr'`. In Linux or WSL use `export HEARTWOOD_LANG=tr`.

Both sets of command names work in either interface language. Use `register` or `kayıt` (`kayit`) to create an account, and `login` or `giriş` (`giris`) to return. This guide uses English command names. The [Turkish guide](terminal-guide.tr.md) shows the corresponding Turkish commands.

## Local Synapse

Run the following once in Ubuntu WSL or Linux. You need Python 3, the `venv` module, and `curl`. This installs a Python environment under your Linux home directory and works without `ensurepip`.

```sh
mkdir -p "$HOME/.local/share/heartwood"
python3 -m venv --without-pip "$HOME/.local/share/heartwood/venv"
curl -fsSL https://bootstrap.pypa.io/pip/pip.pyz -o "$HOME/.local/share/heartwood/pip.pyz"
"$HOME/.local/share/heartwood/venv/bin/python" "$HOME/.local/share/heartwood/pip.pyz" install matrix-synapse==1.164.2
```

In Windows PowerShell, start the lab from `terminal/`. For a WSL distribution other than Ubuntu, substitute its name in the first command and set `HEARTWOOD_WSL_DISTRO` to that name. On Linux, run `export HEARTWOOD_SYNAPSE_PYTHON="$HOME/.local/share/heartwood/venv/bin/python"` before the same Node command.

```powershell
$linuxHome = (wsl -d Ubuntu --exec printenv HOME).Trim()
$env:HEARTWOOD_SYNAPSE_PYTHON = "$linuxHome/.local/share/heartwood/venv/bin/python"
node lab/run.ts --lang en 18008
```

The lab listens only on `127.0.0.1:18008` and displays a 30-minute registration token good for three uses when ready. Keep that window open. Ctrl+C stops the lab and removes its server and fictional account files. The access log omits the admin password and tokens.

## Two-terminal demo

Open two PowerShell windows in `terminal/`. The lab uses a fresh server database on each launch, so these commands create a fresh local profile name for each run.

```powershell
# Alice's window
$demoProfile = 'alice-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
npm.cmd start -- --lang en register $demoProfile http://127.0.0.1:18008 alice
```

```powershell
# Bob's window
$demoProfile = 'bob-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
npm.cmd start -- --lang en register $demoProfile http://127.0.0.1:18008 bob
```

1. Enter the registration token and account passwords at the prompts. Use a separate store passphrase for each profile.
2. Alice runs `/invite @bob:localhost`. Bob runs `/requests` followed by `/accept !ROOM`. Substitute the full room ID from the list for `!ROOM`.
3. Both users run `/identity` to display their account, device and full code. Compare all eight groups over a trusted second channel. Alice runs `/verify @bob:localhost BOB_CODE` and Bob runs `/verify @alice:localhost ALICE_CODE`. Use the displayed ASCII spaces or enter the 64 characters without spaces.
4. Both users run `/conversations` to see the other person and the device trust status, then open their listed conversation with `/chat 1` using its number. Type `Hello Bob` at the `chat>` prompt and press Enter. The message appears in the other terminal. `/back` returns to the main prompt and `/exit` closes the profile.
5. In a separate invitation, try `/reject !ROOM`. After Bob runs `/block @alice:localhost`, he leaves the related Heartwood rooms and new invitations from Alice are hidden.

While the same lab is running, Bob can exit with `/exit` and return from the same window with `npm.cmd start -- --lang en login $demoProfile http://127.0.0.1:18008 bob`. Reuse the existing profile name. Read previous messages with `/history !ROOM`.

Profiles live under `.heartwood/` in the operating system user's home directory. A profile contains its device ID, public key pins, blocklist, sync cursor, and pending invitation IDs. The account password and access token stay off disk. After an abnormal shutdown, the current profile lock recovers when it can acquire the operating system lock. For an unmarked legacy `in-use` directory, independently verify that all clients are stopped before removing the verified empty directory. Losing the profile's key store prevents this client from recovering older messages.

## Integration tests

In a development checkout, run these commands from `terminal/`. The integration runner starts a separate instance from the demo. The default test port is `18019`. Set `HEARTWOOD_TEST_PORT` to choose another one. The runner passes the registration token to the test process in memory and cleans up its working directory at the end.

```powershell
node ci/verify.ts
$linuxHome = (wsl -d Ubuntu --exec printenv HOME).Trim()
$env:HEARTWOOD_SYNAPSE_PYTHON = "$linuxHome/.local/share/heartwood/venv/bin/python"
node integration/run-local.ts
```

On Linux or WSL with Node.js 24.20.0 installed, run the commands directly. The PTY test launches two real CLI processes and requires Python 3.13 or later.

```sh
npm ci
node ci/verify.ts
export HEARTWOOD_SYNAPSE_PYTHON="$HOME/.local/share/heartwood/venv/bin/python"
node integration/run-local.ts
node integration/run-pty.ts
```

CI runs type checks and unit tests on Windows and Linux. A separate Linux job runs Synapse and PTY scenarios. [CI workflow](../../.github/workflows/terminal.yml)

Heartwood provides the terminal interface, device pins, room and membership rules, and HTTP orchestration. The Matrix Rust SDK binding provides Olm/Megolm and the key store. Synapse runs the server and stores events. Server event and log checks cover the example text in the tested flow. [Architecture and threat boundary](technical-design.md)

## Live chat and pending sends

Live chat shows connected, reconnecting, and catch-up status. For transient failures, delays range from roughly half a second to eight seconds. Live reading pauses after five automatic attempts or when an authorization or protocol error occurs. Use `/refresh` in live chat to resume manually.

For an uncertain send, use `/retry` in live chat or `/retry !ROOM` from the main prompt. `/pending` shows room IDs. To drop local tracking, run `/discard` in live chat or `/discard !ROOM` at the main prompt. Confirm with `yes` or `evet` in either interface language. The message may have reached the server and any server event remains. On exit, Heartwood reports the number of uncertain sends. Server acceptance confirms that Matrix stored the event.

Terminals with bracketed paste mark a multiline paste as one operation. Heartwood rejects that block and rings the terminal bell. Without framing, the terminal sees paste and sequential keystrokes as the same input. The POSIX PTY scenario runs on Linux and WSL.

## Read older messages

From live chat, use `/back` to return to the main prompt. Start with `/history !ROOM` and use `/older !ROOM` if a continuation notice appears. Substitute the full room ID for `!ROOM`. Each command requests up to 50 raw Matrix events. A page may show fewer text messages or no displayable messages. If an empty page has a continuation notice, continue with `/older`.

`/history` starts room navigation over. A connection failure or server cursor that fails to advance preserves the last successful continuation position. The navigation cursor is held in memory per room for the session and cleared on exit.
