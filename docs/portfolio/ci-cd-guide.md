# Heartwood CI CD görev paylaşımı ve ajan promptu

Tarih: 11 Kasım 2026. Amaç: mevcut CI'ı doğrulamak, merge kontrollerini kurmak ve test edilmiş sürümler için taslak release teslimi hazırlamak.

## Mevcut durum

- `.github/workflows/terminal.yml` mevcut ve Git tarafından takip ediliyor.
- Dal push'u, pull request, elle çalıştırma ve sürüm akışından yeniden kullanım tanımlı.
- Windows ve Ubuntu'da tip kontrolü ve birim testleri çalışacak şekilde yapılandırılmış.
- Linux işi geçici Synapse üzerinde entegrasyon ve PTY testlerini içeriyor.
- Genel token yetkisi `contents: read`; checkout kimlik bilgilerini kalıcı tutmuyor.
- `terminal/package.json` sürümü inceleme sırasında `0.3.0`.
- Yeni CI/CD değişiklikleri `codex/ci-cd-pipeline` dalında yerel olarak hazırlanır. Bu dal için GitHub Actions sonucu ve repository ayarları GitHub üzerinde ayrıca kontrol edilir.
- Önceki `main` commit'i `b0cf3c4` için GitHub API'sinde üç CI işi de başarılı. [Önceki GitHub Actions koşusu](https://github.com/menura02/heartwood/actions/runs/42979193309)
- Eski tarifin yerinde aktif iş akışına yönlendirme bulunur.

Bu rehber sorumlulukları böler. Ajan uygun erişim ve açık talimat verilirse GitHub ayarlarını da yönetebilir; bunlar teknik olarak yalnızca insanın yapabileceği işler değildir. Aşağıdaki varsayılan düzen, hesap kararlarını ve dışarıya yayımlamayı kullanıcıda bırakır.

## Senin yapacakların

### İlk kurulum ve erişim

- [ ] Çalışılacak GitHub repository'sini ve görünürlüğünü seç; mevcut repository varsa yeniden oluşturma. Sırf CI için özel depoyu herkese açık yapma.
- [ ] Gerekirse GitHub oturumunu veya Git/CLI erişimini kendi ortamında aç. Parola, PAT veya özel anahtarları sohbet mesajına yapıştırma.
- [ ] Repository Settings → Actions → General altında Actions'ın ve kullanılan action'ların çalışmasına izin verildiğini kontrol et. Organization politikası varsa onu dikkate al.
- [ ] Hesabının Actions kullanım kotasını ve ücretlendirme ayarını kontrol et; otomatik olarak ücretli plan veya harcama açma.
- [ ] Ajanın hazırladığı değişiklikleri incele. Aşağıdaki prompt dışarıya push yetkisi vermez; push ve PR işlemini kendin yap veya ajana ayrıca açık talimat ver.

### İlk gerçek CI koşusu

- [ ] Workflow'u içeren branch'i gönder ve PR aç. İlk kez workflow kurulan boş bir depoda önce başlangıç commit'i/default branch düzeni gerekebilir; ajan mevcut duruma göre kesin komutları hazırlasın.
- [ ] Actions veya PR Checks ekranında üç kontrolün sonucunu gör: Windows birim/tip, Ubuntu birim/tip, Linux Synapse ve PTY.
- [ ] Başarısızsa hata veren adımı ve gizli bilgilerden arındırılmış logu ajana ver. Sır içeren ham günlük paylaşma.
- [ ] Ajan gerekli düzeltmeleri yaptıktan sonra aynı kontrollerin yeşil olduğunu doğrula.

İncelenen yerel dalı göndermek ve `main` hedefli PR açmak için repository kökünden çalıştır.

```sh
git push -u origin codex/ci-cd-pipeline
```

GitHub'da PR'ın üç kontrolünü seç. Workflow'daki iş adları `Typecheck and unit tests on windows-2025`, `Typecheck and unit tests on ubuntu-24.04` ve `Synapse integration on Linux`. Ruleset ekranında gerçek başarılı PR koşusunun gösterdiği adları esas al.

### Main için merge kuralları

- [ ] Yetkin ve planın uygunsa Settings → Rules → Rulesets üzerinden `main` hedefli etkin bir kural oluştur.
- [ ] Pull request ve gerekli durum kontrollerini zorunlu yap. Kontrol adlarını başarılı gerçek koşudan seç; tahmini isim girme.
- [ ] Tek kişi çalışıyorsan başka bir kişinin inceleme onayını zorunlu kılarak kendi merge sürecini kilitleme.
- [ ] Force push ve branch silme korumalarını değerlendir. CI hatasını aşmak için kuralları rutin olarak devre dışı bırakma.

Rulesets kullanılabilirliği repository görünürlüğü ve GitHub planına bağlıdır. Ücretsiz özel depoda gerekli seçenek görünmüyorsa ücretli yükseltme veya görünürlük değişikliği otomatik çözüm değildir. Mevcut plandaki desteklenen korumaları kontrol et; teknik zorunluluk uygulanamıyorsa manuel PR/check disiplinini açıkça kaydet. [GitHub rulesets belgesi](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)

### Sürüm çıkarma

- [ ] Sürüm PR'ındaki sürüm numarasını, CHANGELOG'u ve test sonuçlarını inceleyip merge et.
- [ ] İlk teslimin kaynak/Node gerektiren çalıştırma paketi olduğunu kabul et; bağımsız Windows exe veya npm yayını değildir.
- [ ] Test edilen `main` commit'ine uygun `vX.Y.Z` etiketi oluşturup gönder. Mevcut etiketi taşıma veya üzerine yazma. Kesin komutları ajan doğrulanmış sürümle hazırlasın.
- [ ] Release workflow'unun aynı etiket commit'ini doğruladığını ve taslak release oluşturduğunu kontrol et.
- [ ] Paketi indir, checksum'u ve kurulumunu kontrol et. Son yayın kararını ver; hazırsa taslağı yayımla. Taslak da GitHub üzerinde oluşan uzak bir kayıttır, tamamen yerel işlem değildir.

Hazırlık dalı merge edildikten sonra GitHub'da başarılı `main` koşusunun commit'ini kontrol et. Bu teslimde manifest ve kilit dosyası `0.3.0`. Aşağıdaki komutları `origin/main` aynı test edilmiş commit'teyse, sürüm hâlâ `0.3.0` ise ve son sorgu herhangi bir etiket göstermiyorsa sırayla çalıştır.

```sh
git fetch origin main --tags
git rev-parse origin/main
git show origin/main:terminal/package.json
git ls-remote --tags origin refs/tags/v0.3.0
```

```sh
git tag -a v0.3.0 origin/main -m "Heartwood 0.3.0"
git push origin refs/tags/v0.3.0
```

[Sürüm iş akışı](../../.github/workflows/release.yml) aynı etikete ait işleri sıraya alır. Etiket, checkout ve paket sürümleri eşleşmeli ve commit `origin/main` geçmişinde bulunmalı. Kontroller geçerse sadece izin listesindeki kaynaklardan `heartwood-terminal.zip`, `SHA256SUMS` ve sürüm notu hazırlanır. Aktarım artifact'i yedi gün saklanır. Taslak GitHub Releases ekranında ZIP, checksum ve sürüm notuyla görünür. [Paket kurulumu](distribution.md)

Ön sürüm içeren SemVer etiketlerinde taslak GitHub'da ön sürüm olarak işaretlenir. Paket ve checksum'u indirdikten sonra [dağıtım kılavuzundaki](distribution.md) komutlarla doğrula ve taslağın hedef commit'ini gözden geçir.

Aynı etiket için bir taslak veya yayın zaten varsa iş durur. Eksik asset içeren taslağı GitHub'da incele. Paketi ve checksum'u doğrulayıp taslağı elle tamamlayabilir veya mevcut taslağı kendin kaldırdıktan sonra koşuyu yeniden başlatabilirsin. Etiket ve yayımlanmış kayıt değiştirilmez. Paketleme ve yayın için ayrı işler kullanılır. Yalnızca taslak işi `contents: write` alır ve uygulama kaynaklarını çalıştırmaz.

## Ajanın yapabilecekleri

| İş | Somut çıktı | Sınır |
| --- | --- | --- |
| Mevcut durumu inceleme | Workflow, test komutları ve takip edilen dosyaların kontrolü | Geçmiş test sonucunu yeni koşu saymaz |
| CI iyileştirme | Tam SHA pinleri, concurrency, kilit dosyasıyla cache, zaman sınırları | Yeni ücretli servis gerekmez |
| Temiz checkout doğrulama | İzole çalışma alanında kurulum ve test raporu | Kullanıcının çalışma ağacını temizlemez |
| Test raporları | Hassas bilgi içermeyen, kısa süre saklanan sonuçlar | Profil, anahtar deposu ve tam lab dizini yüklenmez |
| Release hazırlığı | Test → paket → SHA-256 → draft release workflow'u | Çalıştırma/yayımlama ayrı kullanıcı eylemi |
| SemVer ve belgeler | Sürüm tutarlılık kontrolü, CHANGELOG ve kullanım rehberi | Gereksiz sürüm artışı yapmaz |
| Git düzeni | İncelenebilir branch, kapsamlı olmayan küçük commit'ler | Push, merge ve tag oluşturmaz |
| GitHub ayar rehberi | Ruleset seçenekleri ve gerçek check adları | Hesap ayarlarını varsayılan olarak değiştirmez |

## Pipeline hedefi

```text
Feature branch → PR → Windows + Linux kontrolleri → main
                                                     ↓
                                           Sürüm hazırlık PR'ı
                                                     ↓
                                           Kullanıcının vX.Y.Z etiketi
                                                     ↓
                              Aynı commit üzerinde tüm zorunlu kontroller
                                                     ↓
                                   Paket ve checksum → taslak release
                                                     ↓
                                       Kullanıcı incelemesi ve yayın
```

CI hiçbir üretim hesabına bağlanmaz. Synapse testleri kurgusal hesaplı, atılabilir yerel örnekte çalışır. Release işi sadece gereken aşamada `contents: write` alır; PR test işlerine bu izin verilmez. [Workflow izinleri](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

## Ajan için kopyalanabilir prompt

```text
Heartwood terminal portföy projesinde mevcut CI'ı sağlamlaştır ve kontrollü sürüm teslim pipeline'ı hazırla. Bu görev dosya hazırlığı, yerel doğrulama ve kapsamı belirli yerel commit'leri kapsar. Push, merge, tag, uzak release oluşturma/yayımlama, repository ayarı veya görünürlük değişikliği yapma.

Önce README.md, docs/portfolio/ci-cd-guide.md, teknik tasarım ve terminal rehberini oku. .github/workflows/terminal.yml, terminal/package.json, package-lock.json, ci/verify.ts, integration/run-local.ts, integration/run-pty.ts, lab başlatıcısı ve CHANGELOG.md dosyalarını incele. Varsa AGENTS.md talimatlarına uy. Git durumunu, takip edilen dosyaları ve mevcut branch'i kontrol et. Kullanıcının commit edilmemiş çalışmalarını koru.

Mevcut CI zaten Windows/Linux tip ve birim testleri ile Linux Synapse ve PTY testlerini tanımlıyor. Sıfırdan benzer bir workflow üretme; mevcut akışı geliştir. Superpowers becerileriyle kısa uygulama planı çıkar ve aşağıdaki kapsamı yürüt.

1. CI güvenilirliği
- Kullanılan action sürümlerinin resmi kaynaklarını doğrula, tam commit SHA'sına sabitle ve okunabilir sürüm yorumunu bırak. SHA uydurma.
- Branch/PR bazlı concurrency ile eski CI koşularını iptal et. Release akışını yanlışlıkla iptal edecek ortak grup kullanma.
- npm önbelleğini terminal/package-lock.json'a bağla; npm ci kullanmaya devam et.
- contents: read, persist-credentials: false ve makul job timeout'larını koru.
- PR kodunu geniş yetkili pull_request_target akışında çalıştırma.
- Birim/tip ve Synapse/PTY kontrolleri ayrı teşhis edilebilir kalsın; başarısızlıklar job sonucuna yansısın.
- Hata raporu gerekiyorsa yalnızca allowlist ile seçilmiş, arındırılmış test raporlarını en fazla 7 gün sakla. Lab, profil, veritabanı, token ve anahtarları artifact'e koyma.
- İlgili dosyaların Git'te takip edildiğini doğrula. Eski docs/portfolio/terminal-ci.yml tarifini aktif workflow'a yönlendirerek tek doğruluk kaynağı oluştur.

2. Sürüm teslimi
- .github/workflows/release.yml hazırla. Kullanıcının gönderdiği v* etiketiyle çalışsın; test başarısı olmadan paket yayımlama aşamasına geçmesin.
- Etiketin geçerli SemVer olduğunu, terminal/package.json ve kilit dosyası sürümleriyle eşleştiğini doğrula. Etiket commit'inin origin/main geçmişinde bulunduğunu doğrula; test veya paket için sessizce main HEAD'e geçme.
- Zorunlu testleri etiketlenen commit üzerinde çalıştır. Gerekirse CI kontrol işlerini yerel reusable workflow ile paylaş; sürümlere göre kontrol listeleri farklılaşmasın.
- Paketleme ve yayın işlerini ayır. Testler/package işi contents: read; yalnızca draft release oluşturma işi contents: write kullansın. Yayın işi uygulama/test kodu çalıştırmasın.
- Kaynak ve Node gerektiren çalıştırma paketini açık bir dosya allowlist'iyle üret. Gerekli istemci kaynakları, package.json, lockfile, kurulum ve güvenlik sınırları belgeleri dahil olsun. Dahil edilen çalıştırma komutlarının referans verdiği dosyalar eksik olmasın.
- node_modules, .git, .lab, .heartwood, kullanıcı profilleri, özel kayıtlar ve eski ticari doküman paketlerini dışarıda bırak. git archive veya tüm repo ZIP'ini tek başına seçilmiş dağıtım paketi sayma.
- Ayrı SHA256SUMS dosyası ve CHANGELOG'dan sürüm notu üret. Paketin desteklenen işletim sistemi, Node gereksinimi ve native kripto bağımlılığı kurulumunu açıkla; tek dosyalık exe iddiası yapma.
- npm publish veya sunucu deploy ekleme; package.json private değerini değiştirme.
- Sonuç draft GitHub Release olsun. Tekrar çalıştırmada mevcut yayımlanmış release'i veya etiketi değiştirme. Aynı etiket için eşzamanlı yayınları sıraya al ve taslakta mevcut asset varsa güvenli davranışı belirle.
- Varsayılan GITHUB_TOKEN yeterliyse PAT veya yeni secret isteme. Hazırlanan workflow'u bu görevde tetikleme.

3. Doğrulama
- Workflow sözdizimini uygun validator ile incele. SemVer eşleşme, yanlış tag, yanlış sürüm ve paket allowlist kontrollerini test et.
- Kullanıcının dosyalarını silmeden temiz checkout veya izole geçici çalışma alanında npm ci ve node ci/verify.ts çalıştır. Henüz commit edilmemiş değişiklikleri sınadıysan bunu gerçek commit checkout'undan ayır.
- Uygun ortam varsa Synapse ve PTY testlerini çalıştır. Eksik ortamı ya da çalıştırılmayan testi açıkça raporla; geçilmiş sayma.
- Oluşturulan paketi ayrı bir dizinde açarak belgelenen kurulum ve yardım komutunu doğrula; kişisel profil veya sır bulunmadığını kontrol et.
- Yerel doğrulamayı GitHub'da workflow çalışmış gibi sunma. Uzak koşu sonucu yoksa açıkça belirt.

4. Git ve SemVer
- İzolasyon gerekiyorsa codex/ci-cd-pipeline branch'ini kullan; mevcut branch ve kullanıcı değişikliklerini önce değerlendir.
- Dosya/hunk bazında stage et. CI, paketleme/release ve dokümantasyon gibi anlamlı doğrulanmış commit'ler oluştur. Körlemesine git add . kullanma.
- Mevcut Heartwood commit kimliği kuralını koru; kimlik uydurma veya global ayar değiştirme.
- Bu çalışma yalnızca CI ve teslim altyapısını değiştiriyorsa ürün minor sürümünü otomatik artırma. Sürüm artışı gerektiğine karar verirsen gerekçesini ve 0.x uyumluluk kuralını belgele; package ve lockfile tutarlı olsun. Tag oluşturma.
- Mevcut bir CHANGELOG sürümünü geçmişte yayımlanmış varsayma; Git tag/remote kanıtı yoksa belirsizliği belirt.
- Reset --hard, clean, force push, merge veya tag taşıma yapma.

5. Kullanıcıya devir
- docs/portfolio/ci-cd-guide.md ve README'yi son uygulamaya göre güncelle.
- Kullanıcının yapacağı Actions ayarı, PR/push, başarılı ilk koşu, main ruleset'i, sürüm etiketi ve final release yayını adımlarını sırala.
- Required check adlarını son workflow ile uyumlu yaz; gerçek GitHub koşusunda seçilmesi gerektiğini belirt.
- Ruleset erişimini GitHub planı ve repository görünürlüğü doğrulanmadan mevcut varsayma; ücretli yükseltme veya public yapma önermeden önce sınırı açıkla.

Son yanıtta değişen dosyaları, yerel commit'leri, doğrulama sonuçlarını, çalıştırılmayan kontrolleri, pipeline'ın henüz tetiklenip tetiklenmediğini ve bana kalan adımları bildir. Uzak işlemler için kesin komut gerekiyorsa gerçek branch/sürümü doğrula; placeholder'ları çalıştırılmış gibi gösterme.
```

## Tamamlanma ölçütü

Yerel hazırlık, ajan dosyaları ve doğrulamayı teslim ettiğinde tamamlanır. CI'ın devrede olduğu ancak GitHub'daki gerçek başarılı koşuyla doğrulanır. Merge koruması repository ayarıyla ayrıca etkinleşir. CD'nin uçtan uca doğrulanması, kullanıcının seçtiği sürüm etiketinden doğru taslak ve paket oluşmasıyla tamamlanır. Bu dört durum birbirinin yerine geçmez.

Yerel doğrulamada temiz Windows ve WSL Linux klonlarında Node 24.20.0 ile `npm ci`, tip kontrolü ve 29 birim testi geçti. Linux'ta dört sürüm/paket regresyonu, gerçek Synapse 1.164.2 entegrasyonu ve PTY senaryosu geçti. Ayrı dizine açılan 42 dosyalı ZIP'in SHA-256 değeri, kurulumu ve yardım komutu doğrulandı. Release oluşturma ve asset yükleme adımları GitHub'da ilk gerçek etiket koşusunda doğrulanır.

## Resmi başvuru kaynakları

- [Action güvenliği ve SHA sabitleme](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub workflow sözdizimi ve izinler](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [Repository rulesets oluşturma](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)
- [Reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [Release API ve gerekli izin](https://docs.github.com/en/rest/releases/releases)

Kaynaklar 11 Kasım 2026 tarihinde kontrol edildi. Hesap erişimi ve uzak repository durumu ayrıca doğrulanmalıdır.
