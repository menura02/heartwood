[English](CHANGELOG.md) | [Türkçe](CHANGELOG.tr.md)

# Değişiklik kaydı

## 0.4.0

### Eklenenler

- Terminal istemcisi ve yerel Synapse laboratuvarı İngilizce ve Türkçe arayüz sunar. Varsayılan dil İngilizcedir. `--lang en|tr` seçeneği `HEARTWOOD_LANG` ortam değişkeninden önceliklidir.
- İngilizce `register` ve `login` komutları ile İngilizce etkileşimli komutlar eklendi.
- Güncel belgeler ve kaynak paketi kurulum kılavuzu her iki dilde sunulur. GitHub taslak sürümleri İngilizce ve Türkçe sürüm notları içerir.

### Uyumluluk

- Önceki Türkçe başlangıç komutları ve etkileşimli komutlar her iki arayüz dilinde de çalışır. Terminal çıktısını eşleştiren betiklerde dili açıkça seç.

## 0.3.0

### Eklenenler

- Canlı sohbet bağlantı ve geçmiş tamamlama durumlarını gösterir. Geçici bağlantı hatalarında sınırlı süreyle otomatik dener. `/yenile` ile elle devam edilebilir.
- `/bekleyenler` belirsiz gönderimlerin oda kimliklerini gösterir. `/vazgec` açık onayla yerel takibi bırakır. Mesaj sunucuya ulaşmış olabilir. `/tekrar` aynı işlem kimliğini ve şifreli yükü kullanır.
- Windows ve Linux için tip kontrolü ve birim testleri, Linux için ayrı Synapse ve POSIX PTY işleri eklendi.

### Düzeltmeler

- Gizli girişler ekrana yansımaz. Gelen bildirimler yazılan taslağı korur. Terminal tarafından işaretlenen çok satırlı yapıştırma bütünüyle reddedilir.
- Ctrl+C ve normal çıkış, terminali ve profil kilidini bırakır. Çıkış sırasında canlı HTTP çağrısı iptal edilir.

### Uyumluluk

- Mevcut profiller ve düz 64 haneli cihaz kodu girişi desteklenir. `/kimlik` çıktısı artık hesap, cihaz ve sekiz gruba ayrılmış tam kodu içerir. Çıktıyı metin olarak işleyen betikler biçimini güncellemelidir.

### Bilinen sınırlamalar

- Bekleyen gönderimler süreç belleğinde tutulur. Çerçevesiz yapıştırma ardışık tuş girişinden ayırt edilemez.
- Gerçek PTY testi Linux ve WSL'de çalışır. Windows yerel PTY davranışı bu testle doğrulanmadı.
