[English](CONTRIBUTING.md) | [Türkçe](CONTRIBUTING.tr.md)

# Heartwood'a katkı

Terminalin ve belgelerin varsayılan dili İngilizcedir. Türkçe tam desteklenen ikinci dildir. Kullanıcıya görünen metinleri eklerken veya değiştirirken iki dili de güncelle. Kod tanımlayıcılarını, yeni kod yorumlarını, geliştirici açıklamalarını ve Conventional Commits biçimindeki commit mesajlarını İngilizce yaz. Deponun yapılandırılmış Git kimliğini kullan.

## Terminal metnini güncelle

1. [Terminal kataloğundaki](terminal/src/locale.ts) `catalog.en` ve `catalog.tr` içinde aynı anahtarı ekle veya değiştir. İletinin gösterildiği yerde merkezi çeviri işlevini kullan. İki dilde aynı adlandırılmış yer tutucuları kullan. Cümledeki sıraları farklı olabilir.
2. Çağıranın sağladığı değer için her iki şablonda `{name}` kullan. Adlandırılmış argümanı geçir. Örneğin yeni bir `greeting` anahtarı için `translator(language).text('greeting', {name: displayName})` kullan. Kullanıcının mesajlarını, adlarını ve oda adlarını olduğu gibi aktar. Matrix protokol alanlarını, API anahtarlarını, veritabanı alanlarını ve kriptografik verileri olduğu gibi koru.
3. Yeni komutları İngilizce adlandır ve mevcut Türkçe takma adları iki arayüz dilinde de koru. Makine tarafından okunan çıktıları ve kalıcı veri biçimlerini koru. Yerelleştirilmiş hata açıklamaları için [hata kataloğunu](terminal/src/failures.ts) kullan ve teknik hata kodlarını sabit tut. Bilinmeyen hatalar için yerelleştirilmiş genel bir ileti göster. Ham hataları ve gizli bilgileri kullanıcıya görünen çıktının dışında tut.

## Belgenin iki sürümünü güncelle

1. Eşleşmeyi [belge kapsamı listesinde](terminal/ci/document-pairs.json) bul. İngilizce için varsayılan `.md` adını, Türkçe için `.tr.md` adını kullan. Yeni güncel belge eşleşmelerini bu dosyaya ekle.
2. Her iki dosyanın başına `[English](file.md) | [Türkçe](file.tr.md)` ekle. Teknik ayrıntıların, güvenlik sınırlarının, bağlantıların ve çalışan komutların iki dilde eşdeğer olmasını sağla. Komut satırı örneklerinde ilgili dildeki gerçek yardım çıktısını kullan.
3. Kişisel taslakları ve geçmiş çalışma belgelerini yerelde tut. Kapsam dosyasında tek dosyada iki dil kullanımının ve ajan talimatları, geçmiş belgeler, üçüncü taraf dosyaları, lisanslar ve üretilmiş çıktılar için tanınan istisnaların gerekçeleri yer alır.

CI gerekli belge sürümlerini, karşılıklı dil bağlantılarını ve kapsamdaki güncel belgelerin göreli Markdown bağlantılarını denetler. Bir çekme isteği belgenin tek sürümünü değiştirirse inceleme uyarısı çıkar. Anlam değiştiyse diğer sürümü de güncelle. Düzeltme tek bir dile özgüyse nedenini çekme isteğinde açıkla. CI, çevirilerin aynı anlamı taşıdığını kanıtlayamaz. İki sürümü de incele.

## Kontrolleri çalıştır

Node.js 24.20.0 kurulu ortamda depo kökünden şu komutları çalıştır.

```sh
cd terminal
npm ci
node ci/verify.ts
node ci/check-docs.ts
npm start -- --help
npm start -- --lang tr --help
```

`ci/verify.ts`, tip kontrolünü ve dil kontrolleri dahil birim testlerini çalıştırır. Terminal etkileşimleri değiştiğinde `HEARTWOOD_SYNAPSE_PYTHON` değerini ayarlamak için [laboratuvar kurulumunu](README.tr.md#yerel-laboratuvarı-dene) izle. `terminal/` içinden Linux’ta veya WSL kullanan Windows’ta `node integration/run-local.ts` çalıştır. Node ve Python 3.13 veya üstüyle Linux veya WSL’de `node integration/run-pty.ts` çalıştır. Testler kendi laboratuvarlarını başlatır. Paketlemeyi `python -B ci/test_release.py` ile sına.

Windows ConPTY testi için Windows Node.js, yerel Python 3.12 veya üstü ve yukarıdaki WSL Synapse ortamıyla PowerShell’den `node integration/run-pty.ts` çalıştır. `python` komutu kullanılamıyorsa `HEARTWOOD_PTY_PYTHON` değişkenine yerel Python yolunu yaz. CI sunucu için yalıtılmış bir WSL dağıtımı kurar ve iki istemciyi Windows Node.js ile çalıştırır. Yapıştırma senaryosu sınır işaretlerini açıkça gönderir.

## Sürüm hazırla

1. `terminal/package.json`, kilit dosyası ve iki değişiklik kaydındaki sürümleri eşleştir. Windows ve Ubuntu kontrolleriyle Linux Synapse işi geçince PR’ı birleştir. Ortaya çıkan `main` commit’inde CI’ın geçtiğini doğrula. [CI iş akışı](.github/workflows/terminal.yml)
2. Sürüme karşılık gelen etiketin yerelde ve uzakta boşta olduğunu doğrula. Test edilen commit’i etiketle ve etiketi gönder. Sürüm iş akışı etiketi ve commit’i doğrular, CI’ı yeniden çalıştırır ve kaynak ZIP’i, özet dosyası ve iki dilli notlarla bir taslak hazırlar. Aynı etiket için taslak veya sürüm varsa durur. [Sürüm iş akışı](.github/workflows/release.yml)
3. Taslağın commit’ini ve notlarını incele. GitHub’da yayımlamadan önce [ZIP’i indirip doğrula](README.tr.md#verify-zip) ve açılan paketten kurulumu yap.
