[English](ci-cd-guide.md) | [Türkçe](ci-cd-guide.tr.md)

# Heartwood CI ve sürüm yayınları

## Pull request kontrolleri

Terminal iş akışı dal push'larında ve pull request'lerde çalışır, elle başlatılabilir ve sürüm iş akışı tarafından yeniden kullanılır. Node.js 24.20.0, `npm ci` ve kilit dosyasına bağlı npm önbelleği kullanır. Sabitlenmiş Action'lar depo içeriğine salt okunur erişimle çalışır. Checkout kimlik bilgilerini kalıcı tutmaz. Linux entegrasyon işi, kurgusal hesaplarla atılabilir bir loopback Synapse başlatır ve gerçek istemciyi POSIX PTY'lerde çalıştırır. [Terminal iş akışı](../../.github/workflows/terminal.yml)

1. Settings → Actions → General altında Actions'ın ve iş akışında kullanılan Action'ların etkin olduğunu kontrol et. Depo görünürlüğü, erişim ve ücretlendirme hesap ve kuruluş politikalarına bağlıdır.
2. `main` dalını hedefleyen bir PR aç. Sonuçları PR'ın Checks sekmesinde veya Actions ekranında incele. İş akışındaki iş adları şunlardır:

   - `Typecheck and unit tests on windows-2025`
   - `Typecheck and unit tests on ubuntu-24.04` (belge dil eşleri ve bağlantıları dahil)
   - `Synapse integration on Linux` (sürüm paketleme kontrolleri, Synapse ve PTY testleri)

3. Depo ve planın destekliyorsa Settings → Rules → Rulesets altında `main` dalını hedefleyen bir kuralı etkinleştir. Pull request'i zorunlu tut ve durum kontrollerini başarılı PR koşusundaki adlarıyla seç. Zorunlu kontroller kullanılamıyorsa elle yürütülecek PR ve kontrol adımlarını kaydet. [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)

Yerel tip kontrolü ve birim testleri için `terminal/` altında `npm ci` sonrasında `node ci/verify.ts` çalıştır. Entegrasyon ve PTY senaryolarını terminal kılavuzunda belirtilen desteklenen ortamlarda çalıştır. Yerel test sonuçları, başarılı GitHub koşusu, etkin ruleset ve başarılı sürüm koşusu sürecin ayrı bölümlerini doğrular. [Terminal kurulumu ve testler](terminal-guide.tr.md)

## Sürüm taslağı hazırla

1. Sürüm değişikliklerini ve manifest, kilit dosyası ve iki dildeki değişiklik kayıtlarında sürümün eşleştiğini incele. Sürüm PR'ını birleştir ve kontrolleri geçen `main` commit'ini belirle. [İngilizce değişiklik kaydı](../../CHANGELOG.md) · [Türkçe değişiklik kaydı](../../CHANGELOG.tr.md)
2. `origin/main` dalının test edilen commit'i gösterdiğini ve uygun etiketin kullanılmadığını doğrula. Örneğin 0.4.0 için depo kökünden şu komutları çalıştır:

   ```sh
   git fetch origin main --tags
   git rev-parse origin/main
   git show origin/main:terminal/package.json
   git tag --list v0.4.0
   git ls-remote --tags origin refs/tags/v0.4.0
   ```

3. Commit ve sürüm eşleşirse ve iki etiket sorgusu da boş dönerse etiketi oluşturup gönder. Örnekten farklıysa gerçek sürüm numarasını kullan:

   ```sh
   git tag -a v0.4.0 origin/main -m "Heartwood 0.4.0"
   git push origin refs/tags/v0.4.0
   ```

4. GitHub Releases ekranında taslağı incele. Yayınlamadan önce hedef commit'i doğrula, iki dosyayı da indir, checksum'u doğrula ve arşivden çıkarılan kaynağı kur. [Kaynak paket kurulumu](distribution.tr.md)

Sürüm iş akışı SemVer etiketini, checkout'u, paket sürümlerini ve commit'in `origin/main` geçmişinde olduğunu doğrular. Terminal kontrollerini aynı commit'te çalıştırır, yalnızca izin listesindeki kaynakları paketler ve `heartwood-terminal.zip`, `SHA256SUMS` ve iki dilli sürüm notlarını hazırlar. Aktarım artifact'i yedi gün saklanır. Son iş, etiketin hedefini ve checksum'u doğruladıktan sonra taslak oluşturur. SemVer ön sürüm etiketlerinin taslakları ön sürüm olarak işaretlenir. Yalnızca bu iş `contents: write` iznini alır ve proje kaynakları checkout edilmeden çalışır. [Sürüm iş akışı](../../.github/workflows/release.yml)

Aynı etiket için bir taslak veya yayın varsa sürüm işi durur. Taslak eksikse paket ve checksum'u doğrulayıp GitHub üzerinden tamamla veya yeniden çalıştırmadan önce o taslağı kaldır. Taslak, bakım sorumlusu yayımlayana kadar GitHub Releases'ta kalır.
