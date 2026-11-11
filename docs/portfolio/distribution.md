[English](distribution.md) | [Türkçe](distribution.tr.md)

# Heartwood terminal source package

The package requires Node.js 24 on Windows or Linux. The tested version is 24.20.0. The client runs natively on Windows. The disposable Synapse lab requires Linux or Ubuntu WSL.

## Verify and run the package

On Linux or WSL, run this from the directory containing both files before extracting the ZIP:

```sh
sha256sum -c SHA256SUMS
```

Use this check in Windows PowerShell:

```powershell
$actual = (Get-FileHash -LiteralPath heartwood-terminal.zip -Algorithm SHA256).Hash
$expected = ((Get-Content -LiteralPath SHA256SUMS -Raw).Trim() -split '\s+')[0]
if ($actual -ne $expected) { throw 'SHA-256 mismatch' }
```

Extract the ZIP to a new directory. From the extracted package root, run:

```sh
cd terminal
npm ci
npm start -- --help
```

In PowerShell you can use `npm.cmd`. The lockfile pins the Matrix Rust SDK Node binding. Its installer downloads the binary for your operating system from GitHub Releases. The initial installation requires network access. [Native binding and supported platforms](https://github.com/matrix-org/matrix-rust-sdk-crypto-nodejs#usage)

The client and lab default to English. Set `HEARTWOOD_LANG=tr` or pass `--lang tr` to select Turkish. An explicit `--lang en` or `--lang tr` overrides the environment. Both English and Turkish commands work in either interface language.

## Try the local Synapse lab

In Linux or Ubuntu WSL, install Synapse 1.164.2 with Python 3.13 and `venv`. These commands create a separate Python environment in your home directory:

```sh
python3.13 -m venv "$HOME/.local/share/heartwood/synapse-1.164.2"
"$HOME/.local/share/heartwood/synapse-1.164.2/bin/python" -m pip install matrix-synapse==1.164.2
```

On Linux, run this from the package's `terminal/` directory:

```sh
export HEARTWOOD_SYNAPSE_PYTHON="$HOME/.local/share/heartwood/synapse-1.164.2/bin/python"
node lab/run.ts --lang en 18008
```

On Windows, run this in PowerShell from the package's `terminal/` directory:

```powershell
$linuxHome = (wsl -d Ubuntu --exec printenv HOME).Trim()
$env:HEARTWOOD_SYNAPSE_PYTHON = "$linuxHome/.local/share/heartwood/synapse-1.164.2/bin/python"
node lab/run.ts --lang en 18008
```

From a second terminal in `terminal/`, create a fictional account with `npm start -- --lang en register alice http://127.0.0.1:18008 alice`. Enter the short-lived registration token displayed by the lab at the client's prompt. Compare device codes with the other user over a trusted second channel. The lab listens only on the loopback address. The client creates its profile and key store in your home directory. [Architecture and security boundaries](technical-design.md)
