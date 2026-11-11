[English](README.md) | [Türkçe](README.tr.md)

# Heartwood

Aynı Matrix sunucusundaki iki kişi için gizlilik odaklı, şifreli metin sohbeti sunan TypeScript terminal istemcisi. Heartwood cihaz doğrulaması ve yerel Synapse laboratuvarı içerir.

## Kurulum

Windows veya Linux’ta Node.js 24.20.0 kullan. Depo kopyasının veya ZIP’ten çıkardığın kaynak paketin kökünde çalıştır:

```sh
cd terminal
npm ci
npm start -- --help
npm start -- --lang tr --help
```

PowerShell betiği engelleniyorsa `npm.cmd` kullan. Kurulum platformuna uygun Matrix bağlayıcısını indirir. Kurulumdan sonra yerel sohbet çevrimdışı çalışabilir. Varsayılan dil İngilizcedir. `--lang en|tr`, `en` veya `tr` alan `HEARTWOOD_LANG` ortam değişkeninden önceliklidir. Mevcut Türkçe komutlar iki dilde de çalışır. [Bağlayıcı ve desteklenen platformlar](https://github.com/matrix-org/matrix-rust-sdk-crypto-nodejs#usage)

## Yerel laboratuvarı dene

Linux veya Ubuntu WSL’de Synapse’i ayrı bir Python ortamına kur. Python 3.13 veya üstü, `venv` ve `curl` kullan. Bu kurulum `ensurepip` gerektirmez.

```sh
mkdir -p "$HOME/.local/share/heartwood"
python3 -m venv --without-pip "$HOME/.local/share/heartwood/venv"
curl -fsSL https://bootstrap.pypa.io/pip/pip.pyz -o "$HOME/.local/share/heartwood/pip.pyz"
"$HOME/.local/share/heartwood/venv/bin/python" "$HOME/.local/share/heartwood/pip.pyz" install matrix-synapse==1.164.2
```

Linux’ta `terminal/` içindeyken `export HEARTWOOD_SYNAPSE_PYTHON="$HOME/.local/share/heartwood/venv/bin/python"` ayarla ve `node lab/run.ts --lang tr 18008` çalıştır. Windows’ta laboratuvarı `terminal/` içinden PowerShell ile başlat.

```powershell
$linuxHome = (wsl -d Ubuntu --exec printenv HOME).Trim()
$env:HEARTWOOD_SYNAPSE_PYTHON = "$linuxHome/.local/share/heartwood/venv/bin/python"
node lab/run.ts --lang tr 18008
```

Başka bir WSL dağıtımı kullanıyorsan adını komutta ve `HEARTWOOD_WSL_DISTRO` değişkeninde kullan. Laboratuvar penceresini açık tut. Yalnızca yerel geri döngü adresini dinleyen laboratuvar, 30 dakika ve üç kullanım için geçerli kayıt belirtecini gösterir. Ctrl+C laboratuvarı durdurur ve geçici sunucu ile hesap dosyalarını kaldırır.

1. `terminal/` altındaki ayrı pencerelerde `npm start -- --lang tr register alice-demo http://127.0.0.1:18008 alice` ve `npm start -- --lang tr register bob-demo http://127.0.0.1:18008 bob` çalıştır. Her yeni laboratuvar için yeni profil adları seç, belirteci ve parolaları istendiğinde gir.
2. Alice `/invite @bob:localhost` çalıştırır. Bob `/requests` ve ardından tam oda kimliğiyle `/accept !ROOM` çalıştırır.
3. İki kullanıcı da `/identity` ile kodunu gösterir. Tam cihaz kodlarını güvenilir bir ikinci kanalda karşılaştır, ardından karşı tarafın kullanıcı kimliği ve koduyla `/verify @user:localhost CODE` çalıştır.
4. `/conversations` ile sohbetleri listele, `/chat 1` ile listelenen sohbeti aç ve mesaj yaz. `/back` ana ekrana döner. `/exit` profili kapatır. Aynı laboratuvar çalışırken aynı profil ve hesapla `login` kullanarak geri dön.

Ana ekranda `/history !ROOM` son sayfayı getirir. Devamı varsa `/older !ROOM` kullan. Canlı sohbette `/refresh` duraklatılan okumayı sürdürür. Belirsiz gönderimler için `/retry` ile tekrar dene veya `/pending` ile ilgili odaları listele. Ana ekranda `/retry !ROOM` kullan. `/discard`, `yes` veya `evet` onayıyla yerel takibi bırakır. Ana ekranda `/discard` komutuna oda kimliğini ekle.

<a id="verify-zip"></a>

## İndirilen ZIP’i doğrula

`heartwood-terminal.zip` ve `SHA256SUMS` dosyalarının bulunduğu dizinde Linux veya WSL’de `sha256sum -c SHA256SUMS` çalıştır. PowerShell’de şu komutları kullan:

```powershell
$actual = (Get-FileHash -LiteralPath heartwood-terminal.zip -Algorithm SHA256).Hash
$expected = ((Get-Content -LiteralPath SHA256SUMS -Raw).Trim() -split '\s+')[0]
if ($actual -ne $expected) { throw 'SHA-256 uyuşmuyor' }
```

ZIP’i yeni bir dizine aç ve [Kurulum](#kurulum) adımlarını izle. [Mimari](ARCHITECTURE.tr.md) · [Güvenlik ve sınırlar](SECURITY.tr.md) · [Değişiklik kaydı](CHANGELOG.tr.md)
