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
3. Geçmiş belgelerin özgün sürümlerini [arşiv dizinindeki](docs/archive/README.tr.md) kurala göre koru. Kapsam dosyasında tek dosyada iki dil kullanımının ve ajan talimatları, geçmiş belgeler, üçüncü taraf dosyaları, lisanslar ve üretilmiş çıktılar için tanınan istisnaların gerekçeleri yer alır.

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

`ci/verify.ts`, tip kontrolünü ve dil seçimi, katalog anahtarları, adlandırılmış yer tutucular ve boş olmayan çeviriler dahil birim testlerini çalıştırır. Terminal etkileşimlerini değiştirdiğinde desteklenen ortamlarda Synapse ve PTY kontrollerini çalıştırmak için [terminal kılavuzunu](docs/portfolio/terminal-guide.tr.md) izle.
