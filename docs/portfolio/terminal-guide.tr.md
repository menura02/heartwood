[English](terminal-guide.md) | [Türkçe](terminal-guide.tr.md)

# Heartwood terminal kurulumu ve gösterimi

## İstemci

Tekrarlanabilir kurulum için Node 24.20.0 ve onunla gelen npm'i kullan. Windows veya Linux checkout'unda `terminal/` dizininden çalıştır.

```sh
npm ci
npm start -- --lang tr --help
```

Matrix bağlayıcısının resmî platform ikilisi kurulum sırasında GitHub Releases'dan indirilir. Kurulum tamamlandıktan sonra yerel sohbet için internet erişimi gerekmez. [Desteklenen platformlar](https://github.com/matrix-org/matrix-rust-sdk-crypto-nodejs#usage)

İstemcinin ve laboratuvarın varsayılan dili İngilizcedir. Türkçeyi varsayılan yapmak için `HEARTWOOD_LANG=tr` ayarla. Tek çalıştırmada ortam değişkeninin yerine `--lang en` veya `--lang tr` seçeneğini kullan. PowerShell'de `$env:HEARTWOOD_LANG = 'tr'`, Linux veya WSL'de `export HEARTWOOD_LANG=tr` çalıştır.

Her iki arayüz dilinde iki dilin komutları da çalışır. Hesap açmak için `register` veya `kayıt` (`kayit`), yeniden oturum açmak için `login` veya `giriş` (`giris`) kullan. Bu kılavuz Türkçe komutları kullanır. [İngilizce kılavuz](terminal-guide.md) bunların İngilizce karşılıklarını gösterir.

## Yerel Synapse

Aşağıdaki komutları Ubuntu WSL veya Linux terminalinde bir kez çalıştır. Python 3, `venv` modülü ve `curl` gerekir. Kurulum Python ortamını kullanıcının Linux ana dizinine yazar. Bu yöntem `ensurepip` kurulumu gerektirmez.

```sh
mkdir -p "$HOME/.local/share/heartwood"
python3 -m venv --without-pip "$HOME/.local/share/heartwood/venv"
curl -fsSL https://bootstrap.pypa.io/pip/pip.pyz -o "$HOME/.local/share/heartwood/pip.pyz"
"$HOME/.local/share/heartwood/venv/bin/python" "$HOME/.local/share/heartwood/pip.pyz" install matrix-synapse==1.164.2
```

Windows PowerShell'de `terminal/` dizininden laboratuvarı başlat. Ubuntu dışındaki WSL dağıtımında ilk komuttaki dağıtım adını ve `HEARTWOOD_WSL_DISTRO` değerini ayarla. Linux'ta aynı Node komutundan önce `export HEARTWOOD_SYNAPSE_PYTHON="$HOME/.local/share/heartwood/venv/bin/python"` kullan.

```powershell
$linuxHome = (wsl -d Ubuntu --exec printenv HOME).Trim()
$env:HEARTWOOD_SYNAPSE_PYTHON = "$linuxHome/.local/share/heartwood/venv/bin/python"
node lab/run.ts --lang tr 18008
```

Başlatıcı yalnızca `127.0.0.1:18008` üzerinde çalışır ve hazır olunca üç kullanımlık, 30 dakikalık kayıt belirtecini terminalde gösterir. Bu pencereyi açık bırak. Ctrl+C ile çıkıldığında bu koşunun sunucu ve kurgusal hesap dosyaları temizlenir. Yönetici parolası ve belirteçler erişim günlüğüne yazılmaz.

## İki terminalle gösterim

Her iki PowerShell penceresinde `terminal/` dizininde ol. Yeni laboratuvar her çalıştırmada yeni bir sunucu veritabanı açar. Aşağıdaki komutlar bu yüzden her koşuya yeni profil adları verir.

```powershell
# Alice penceresi
$demoProfile = 'alice-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
npm.cmd start -- --lang tr kayit $demoProfile http://127.0.0.1:18008 alice
```

```powershell
# Bob penceresi
$demoProfile = 'bob-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
npm.cmd start -- --lang tr kayit $demoProfile http://127.0.0.1:18008 bob
```

1. İki pencerede de belirteci ve hesap parolalarını istemlerde gir. Her profil için ayrı bir depo parolası kullan.
2. Alice `/davet @bob:localhost` çalıştırır. Bob `/istekler` ardından `/kabul !ODA` çalıştırır. `!ODA` yerine listelenen tam oda kimliğini yaz.
3. Her iki kullanıcı `/kimlik` ile hesap, cihaz ve tam kodunu görür. Sekiz grubu güvenilir ikinci kanaldan karşılaştır. Alice `/dogrula @bob:localhost BOB_KODU`, Bob `/dogrula @alice:localhost ALICE_KODU` çalıştırır. Kodu ekrandaki tek ASCII boşluklarla veya düz 64 hane olarak gir.
4. Alice ve Bob `/sohbetler` ile karşı tarafı ve doğrulama durumunu görür, ardından listelerindeki numarayla `/sohbet 1` çalıştırır. `sohbet>` satırına `Merhaba Bob` yazıp Enter'a bas. Diğer terminalde mesaj görünür. `/geri` ana komut ekranına döner, `/cikis` profili kapatır.
5. Ayrı bir davette `/ret !ODA` akışını dene. `/engelle @alice:localhost` sonrasında Bob ilgili Heartwood odalarından ayrılır ve yeni Alice davetleri gösterilmez.

Aynı laboratuvar çalışırken Bob `/cikis` ile çıkıp aynı PowerShell penceresinde `npm.cmd start -- --lang tr giris $demoProfile http://127.0.0.1:18008 bob` ile geri dönebilir. Yeni profil adı üretme. Önceki mesajları `/gecmis !ODA` ile aç.

Profiller işletim sistemi kullanıcı dizinindeki `.heartwood/` altında tutulur. Profilde cihaz kimliği, açık anahtar pinleri, engel listesi, eşzamanlama imleci ve bekleyen davet kimlikleri bulunur. Hesap parolası ve erişim belirteci dosyaya yazılmaz. Yeni profil kilidi anormal kapanıştan sonra işletim sistemi kilidi alınabildiğinde otomatik toparlanır. İşaretsiz eski `in-use` klasörü için tüm istemcilerin kapalı olduğunu bağımsız olarak doğrulamak gerekir. Yalnızca doğrulanmış boş eski klasörü kaldır. Profil anahtar deposunu kaybedersen eski mesajları bu istemcide kurtaramazsın.

## Entegrasyon testi

Geliştirme çalışma alanında `terminal/` dizininden şu komutları çalıştır. İkinci komut demo sunucusundan ayrı bir örnek başlatır. Varsayılan test portu `18019`, alternatif `HEARTWOOD_TEST_PORT` ile seçilir. Kayıt belirteci test sürecine bellekte iletilir ve çalışma dizini test sonunda temizlenir.

```powershell
node ci/verify.ts
$linuxHome = (wsl -d Ubuntu --exec printenv HOME).Trim()
$env:HEARTWOOD_SYNAPSE_PYTHON = "$linuxHome/.local/share/heartwood/venv/bin/python"
node integration/run-local.ts
```

Linux veya WSL'de Linux Node 24.20.0 kurulu olduğunda aynı komutları doğrudan çalıştırabilirsin. PTY testi iki gerçek CLI süreci açar ve Python 3.13 veya daha yeni bir sürüm gerektirir.

```sh
npm ci
node ci/verify.ts
export HEARTWOOD_SYNAPSE_PYTHON="$HOME/.local/share/heartwood/venv/bin/python"
node integration/run-local.ts
node integration/run-pty.ts
```

CI tanımı Windows ve Linux tip kontrolünü ve birim testlerini, ayrı Linux işi Synapse ve PTY senaryolarını çalıştırır. [İş akışı](../../.github/workflows/terminal.yml)

Heartwood terminali, cihaz pini, oda/üyelik kuralları ve HTTP orkestrasyonunu sağlar. Olm/Megolm ve anahtar deposu Matrix Rust SDK bağlayıcısına, sunucu ve olay saklama Synapse'e aittir. Sunucu olay ve günlük kontrolü yalnızca test edilen akıştaki örnek metni kapsar. [Tehdit sınırı ve mimari](technical-design.tr.md)

## Canlı sohbet ve bekleyen gönderimler

Açık sohbet `Bağlı`, `Yeniden bağlanıyor` ve `Geçmiş tamamlanıyor` durumlarını gösterir. Geçici hatalarda yaklaşık yarım saniyeden sekiz saniyeye kadar bekler. Beş otomatik deneme sonrasında veya yetki ve protokol hatasında canlı okuma durur. Canlı sohbette `/yenile` ile elle dene.

Sonucu belirsiz gönderim için canlı sohbette `/tekrar`, ana ekranda `/tekrar !ODA` kullan. `/bekleyenler` oda kimliğini gösterir. Yerel takibi bırakmak için canlı sohbette `/vazgec`, ana ekranda `/vazgec !ODA` çalıştır. Her iki arayüz dilinde `evet` veya `yes` yazarak onayla. Mesaj ulaşmış olabilir ve sunucudaki olay korunur. Çıkışta belirsiz gönderim sayısı bildirilir. Sunucu kabulü yalnızca Matrix olayının kaydedildiğini gösterir.

Bracketed paste desteği olan terminaller çok satırlı yapıştırmayı tek işlem olarak işaretler. Heartwood bu bloğu reddedip zil sinyali verir. Çerçevesiz girişte terminal ardışık tuşlar ile yapıştırmayı ayırt edemez. POSIX PTY senaryosu Linux ve WSL'de çalışır.

## Eski mesajları oku

Canlı sohbetten `/geri` ile ana komut ekranına dön. `/gecmis !ODA` ile başla ve devam bildirimi varsa `/onceki !ODA` çalıştır. `!ODA` yerine tam oda kimliğini yaz. Her komut en fazla 50 ham Matrix olayı ister. Bir sayfada daha az metin mesajı veya hiç gösterilebilir mesaj olmayabilir. Boş sayfada devam bildirimi görünüyorsa `/onceki` ile ilerle.

`/gecmis` o odanın gezinmesini baştan başlatır. Bağlantı hatası veya ilerlemeyen sunucu imleci, son başarılı sayfanın devam konumunu değiştirmez. Gezinme oturum boyunca oda başına bellekte tutulur ve çıkışta silinir.
