[English](SECURITY.md) | [Türkçe](SECURITY.tr.md)

# Güvenlik ve sınırlar

- Heartwood HTTPS veya yerel geri döngü HTTP kabul eder ve aynı Matrix sunucusundaki kullanıcıları destekler. İlgili işlemlerde Heartwood işaretini, yalnızca davetle üyeliği, geçmişin katılımdan itibaren görünmesini, iki kişilik üyeliği ve Megolm’u kontrol eder. Odalar federasyon kapalı olarak oluşturulur. İstemci metni yalnızca şifreli olay olarak gönderir. Geçmişi okurken engellemeyi, üyeliği ve gönderen cihazın güvenini kontrol eder.
- Tam cihaz kodunu, hesabı ve cihaz kimliğini güvenilir bir ikinci kanalda karşılaştır. SHA-256 kodu iki açık anahtardan türetilir. Sabitleme tek bir güncel cihaz gerektirir. Anahtar değiştiğinde, doğrulama veya şifreleme eksikse, birden çok cihaz varsa ya da anahtar alıcısı beklenenden farklıysa gönderim durur. Mevcut cihaz sabitlemesi yerinde değiştirilemez. Oda anahtarını almış bir cihaz erişimini koruyabilir. Engelleme önceden alınan içeriğe erişimi kaldırmaz.
- Matrix üyelik, cihaz kimlikleri, zamanlama, IP adresleri ve trafik hacmi gibi metaverileri görür. Uç nokta, işletim sistemi kullanıcısı, terminal geçmişi ve ekran güven sınırı içindedir. Heartwood hesap parolalarını, erişim belirteçlerini ve çözülmüş mesajları diske yazmaz. Yerel profiller cihaz kimliklerini, açık anahtar sabitlemelerini, engelleme listelerini, eşzamanlama imleçlerini ve bekleyen davet kimliklerini tutar. Anahtar deposunu kaybetmek eski mesajların kurtarılmasını engelleyebilir.
- Canlı sohbetin eksikleri tamamlaması, sunucunun sakladığı ve hesabın erişebildiği geçmişe bağlıdır. Şifreli olaylar canlı yeniden deneme tamponundan çıkarsa geçmişten almayı dene. İstemci, kişi başına tek cihazla yürütülen kontrollü iki hesap senaryosu içindir. Anahtar yedekleme, federasyon, birden fazla cihaz, ses ve dosya aktarımı kapsam dışıdır.
- Çok satırlı yapıştırma koruması, yapıştırma sınırlarını işaretleyen bir terminal gerektirir. Linux PTY ve Windows ConPTY testleri bu işaretleri açıkça gönderir. İşaretler olmadan yapıştırma davranışı terminal arayüzüne bağlıdır.

Gerçek kimlik bilgilerini, belirteçleri, anahtarları, profilleri ve özel mesajları Git’e, günlüklere veya hata raporlarına ekleme. Geçici laboratuvar kısa ömürlü kayıt belirtecini yerelde gösterir.

Arama metni, sonuçlar, tekrar engelleme ve okunmamış durumu bellekte tutulur. Sohbetten çıkınca arama referansları bırakılır. JavaScript belleğin fiziksel olarak silinmesini garanti etmez. Yerel kaldırma komutu doğrulanmış profil dosyalarını normal dosya sistemi işlemleriyle siler. İşlem kesilirse elle inceleme için profil kökünde yalıtılmış bir `.removed-*` dizini kalabilir.

[Kurulum ve kullanım](README.tr.md) · [Mimari](ARCHITECTURE.tr.md)
