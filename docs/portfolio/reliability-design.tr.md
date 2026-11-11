[English](reliability-design.md) | [Türkçe](reliability-design.tr.md)

# Terminal istemcisi güvenilirlik tasarımı

11 Kasım 2026

- Canlı sohbet açılırken işlenmiş Matrix `next_batch` imleci alınır. İlk geri sayfa ve ileri okuma aynı sınırdan başlar. Her yenilemede seri olarak `/sync` ve en fazla bir ileri `/messages` sayfası işlenir. Geçerli devam imleci olan boş sayfa ilerler. İlerlemeyen imleçte hata bildirilir. Okuma başarısızsa önceki konum korunur. Yakın olay kimlikleri ve çözülmesi beklenen şifreli olaylar sınırlı bellekte tutulur. Geçmiş komutları kendi geri sayfalama imleçlerini kullanır. [Matrix eşzamanlama ve sayfalama](https://spec.matrix.org/latest/client-server-api/#syncing)
- Her mantıksal gönderim bir UUID ve bir kez oluşturulan Megolm yükü kullanır. Sonuç belirsizse oda başına en fazla bir bekleyen işlem tutulur. `/tekrar` aynı süreçte, aynı oturum ve cihazla, aynı HTTP yolu ve yük üzerinden çalışır. Önce oda, engelleme, güncel cihaz ve orijinal alıcı kimliği doğrulanır. İlk denemede kesin sunucu reddi ayrı gösterilir. Önceki deneme belirsizse sonraki ret geçmiş denemenin sonucunu kesinleştirmez. Sunucu kabulü olay kimliği ile doğrulanır. [Matrix işlem kimlikleri](https://spec.matrix.org/latest/client-server-api/#transaction-identifiers)
- `/sohbetler` erişilebilir Heartwood odalarını, karşı tarafı ve cihaz durumunu listeler. Ardışık listelerde kalan oda ve karşı taraf aynı numarayı korur. Listeden düşen numara emekliye ayrılır. Açılışta ve canlı gönderimde oda ile karşı taraf tekrar kontrol edilir.
- Profil eşzamanlılığı, Node 24 yerleşik SQLite üzerinden işletim sisteminin bıraktığı dosya kilidine bağlanır. Atomik profil yazımı devam eder. Eski istemcilerle eşzamanlı erişimi önlemek için `in-use` dizini kalır. Yalnızca yeni kilit protokolünün işaretlediği dizin, SQLite kilidi alındıktan sonra yeniden sahiplenilir. Belirsiz veya eski işaretsiz dizinde işlem durur. PID karar mekanizmasına girmez.
- Atılabilir loopback Synapse 1.164.2 laboratuvarı mevcut YAML dosyalarını kullanır. Ayrı test portu, geçici kayıt belirteci ve tek koşuda başlatma, sağlık kontrolü, test ve kapatma sağlanır. Windows ve Linux doğrulaması aynı kilit dosyasını ve izlenen test yardımcılarını kullanır. [CI iş akışı](../../.github/workflows/terminal.yml)

Oda modeli, cihaz pini ve kripto altyapısı mevcut tehdit modeline tabidir. Canlı alım ve tekrar durumu süreç ömürlüdür. İşletim sistemi ve dosya sistemi kilit garantileri yerel depolama için değerlendirilir.
