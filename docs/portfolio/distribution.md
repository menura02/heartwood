# Heartwood terminal kaynak paketi

Paket Windows ve Linux üzerinde Node.js 24 gerektirir. Test edilen sürüm 24.20.0. Windows istemcisi yerel olarak çalışır. Atılabilir Synapse laboratuvarı Linux veya Ubuntu WSL gerektirir.

## Paketi doğrula ve çalıştır

Linux veya WSL'de ZIP'i açmadan önce, iki dosyanın bulunduğu dizinde çalıştır.

```sh
sha256sum -c SHA256SUMS
```

Windows PowerShell'de aynı doğrulama.

```powershell
$actual = (Get-FileHash -LiteralPath heartwood-terminal.zip -Algorithm SHA256).Hash
$expected = ((Get-Content -LiteralPath SHA256SUMS -Raw).Trim() -split '\s+')[0]
if ($actual -ne $expected) { throw 'SHA-256 uyuşmuyor' }
```

ZIP'i yeni bir dizine aç. Açtığın paketin kökünden çalıştır.

```sh
cd terminal
npm ci
npm start -- --help
```

PowerShell'de `npm.cmd` kullanılabilir. Kilit dosyası Matrix Rust SDK Node bağlayıcısının sürümünü belirler. Bağlayıcının kurulum betiği işletim sistemine uygun ikiliyi GitHub Releases'dan indirir. İlk kurulum için ağ erişimi gerekir. [Native bağlayıcı ve platform desteği](https://github.com/matrix-org/matrix-rust-sdk-crypto-nodejs#usage)

## Yerel Synapse ile dene

Linux veya Ubuntu WSL terminalinde Python 3.13 ve `venv` ile Synapse 1.164.2 kur. Aşağıdaki kurulum kullanıcıya ait ayrı bir Python ortamı açar.

```sh
python3.13 -m venv "$HOME/.local/share/heartwood/synapse-1.164.2"
"$HOME/.local/share/heartwood/synapse-1.164.2/bin/python" -m pip install matrix-synapse==1.164.2
```

Linux'ta paket içindeki `terminal/` dizininden çalıştır.

```sh
export HEARTWOOD_SYNAPSE_PYTHON="$HOME/.local/share/heartwood/synapse-1.164.2/bin/python"
node lab/run.ts 18008
```

Windows'ta paket içindeki `terminal/` dizininden PowerShell ile çalıştır.

```powershell
$linuxHome = (wsl -d Ubuntu --exec printenv HOME).Trim()
$env:HEARTWOOD_SYNAPSE_PYTHON = "$linuxHome/.local/share/heartwood/synapse-1.164.2/bin/python"
node lab/run.ts 18008
```

Hazır olunca gösterilen kısa ömürlü belirteci istemciye gir. Yeni bir terminalde `npm start -- kayit alice http://127.0.0.1:18008 alice` ile kurgusal bir hesap aç. İkinci bir kullanıcıyla cihaz kodlarını güvenilir bir ikinci kanaldan karşılaştır. Laboratuvar yalnızca loopback adresini dinler. İstemci profil ve anahtar deposunu kullanıcı dizininde oluşturur. [Mimari ve güvenlik sınırları](technical-design.md)
