# Değişiklik kaydı

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
