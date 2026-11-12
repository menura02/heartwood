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

## Tanılama ve yönlendirmeli kurulum

`terminal/` içinden yerel denetimler için `npm start -- --lang tr doctor` çalıştır. Matrix API erişimini de denetlemek için `npm start -- --lang tr doctor http://127.0.0.1:18008` kullan. Çıkış kodu `0` denetimlerin geçtiğini veya uyarı verdiğini gösterir. Kod `1` bir denetimin ya da komut çağrısının başarısız olduğunu gösterir. Doctor dizin erişimi bilgilerini okur ve profilleri değiştirmez. Sunucu denetimi kimlik doğrulaması gerektirmeyen sürüm uç noktasını kullanır. Cihaz doğrulaması ayrı bir adımdır.

`npm start -- --lang tr onboard` çalıştır. Akış, gizli giriş istemlerinden önce kayıt veya giriş seçimini, sunucuyu, profili ve kullanıcı adını sorar. İptal etmek için Ctrl+C’ye bas. Bir sonraki adımı görmek için ana ekranda istediğin zaman `/guide` veya `/rehber` kullan. Davet beklerken `/exit` ile çıkıp normal giriş komutuyla dönebilirsin.

## Sohbet komutları ve yerel profiller

- `/hist` gibi bir komut başlangıcı yazıp Tab’a bas. Eşleşmeler açık ekrana göre değişir. Tab yalnızca komut adlarını önerir. Her iki ekranda da `/help` kullanabilirsin.
- Açık sohbette canlı akıştan ayrılmadan `/history`, ardından `/older` kullan. Geçmiş ve canlı olaylar ayrı başlıklarda görünür. Ana ekranda `/history !ROOM` ve `/older !ROOM` çalışmaya devam eder.
- Açık sohbette `/search merhaba`, `/search-next` ve `/search-prev` kullan. Arama, bu ziyarette gösterilen ve her biri en fazla 4.000 bayt olan son 200 uygun mesajda düz metni eşleştirir. Sayfa başına on sonuç gösterir ve varsa UTC zamanını yazar. Büyük ve küçük harf eşleştirmesi, Türkçedeki noktalı ve noktasız I dahil, seçilen arayüz dilini kullanır. Daha fazla geçmiş yükleyince veya sonuçlar bellekten çıkınca aramayı tekrar çalıştır.
- `/conversations` eşzamanlamayı yeniler. Karşı taraftan gözlemlenen ve henüz okunabilir olarak gösterilmemiş şifreli olaylar için **yeni mesaj etkinliği** işareti gösterir. Başlangıç ve katılım geçmişi, kendi mesajların ve yakın tekrarlar dışarıda kalır. Sunucu sınırlı eşzamanlama döndürdüğünde gösterge bazı olayları kaçırabilir. Yeniden başlatmada sıfırlanır ve okundu bilgisi göndermez.
- Açık sohbette `/status`, ana ekranda `/status !ROOM` kullan. Denetim zamanı, bağlantı, karşı taraf ve cihaz, doğrulama, oda politikası, gönderim olanağı ve bekleyen gönderim ayrı görünür. Heartwood gönderim sırasında politikayı yeniden denetler.
- Eğik çizgiyle başlayan metni göndermek için sohbette `/send MESAJ` yaz. Örneğin `/send /ornek` komutu `/ornek` metnini gönderir.

`terminal/` içinden `npm start -- profiles list`, `npm start -- profiles show alice-demo` veya `npm start -- profiles remove alice-demo` çalıştır. Kaldırmak için profil adını aynen yazmak gerekir. Aktif veya güvenli biçimde doğrulanamayan profiller reddedilir. Yerel anahtarları kaldırmak eski mesajları okunamaz hâle getirebilir. Sunucu hesabı ve mesajları kalır.

## Otomatik demoyu çalıştır

Linux Node.js bulunan Linux veya WSL’de `HEARTWOOD_SYNAPSE_PYTHON` değişkenini yukarıdaki gibi ayarla. `terminal/` içinden `node lab/demo.ts --lang tr` veya `node lab/demo.ts` çalıştır. Komut kendi geçici laboratuvarını açar, iki gerçek terminalde şifreli sohbet ve kontrollü bağlantı kesintisi yürütür, seçilen terminal çıktısını gösterir ve kaynaklarını kapatır. Test aracı kurgusal kimlikler kullanıp kodlarını karşılaştırır. Gerçek kullanıcılar cihaz kodlarını güvenilir bir ikinci kanalda karşılaştırır.

<a id="verify-zip"></a>

## İndirilen ZIP’i doğrula

`heartwood-terminal.zip` ve `SHA256SUMS` dosyalarının bulunduğu dizinde Linux veya WSL’de `sha256sum -c SHA256SUMS` çalıştır. PowerShell’de şu komutları kullan:

```powershell
$actual = (Get-FileHash -LiteralPath heartwood-terminal.zip -Algorithm SHA256).Hash
$expected = ((Get-Content -LiteralPath SHA256SUMS -Raw).Trim() -split '\s+')[0]
if ($actual -ne $expected) { throw 'SHA-256 uyuşmuyor' }
```

ZIP’i yeni bir dizine aç ve [Kurulum](#kurulum) adımlarını izle. [Mimari](ARCHITECTURE.tr.md) · [Güvenlik ve sınırlar](SECURITY.tr.md) · [Değişiklik kaydı](CHANGELOG.tr.md)
