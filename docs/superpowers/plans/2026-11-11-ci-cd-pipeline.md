# Heartwood CI ve sürüm teslimi uygulama planı

> Uygulama becerisi `superpowers:executing-plans`. Kapsam ve teslim ölçütleri `docs/portfolio/ci-cd-guide.md` içinde.

Mevcut terminal workflow'u kendi kontrollerini çalıştırır ve etiket akışına aynı işleri sunar. Sürüm workflow'u etiketi doğrular, testlerden sonra seçili kaynakları paketler ve ayrı yetkili işte yalnızca yeni bir taslak oluşturur.

- [x] Resmî Action etiketlerini ve SHA'larını karşılaştır. `terminal.yml` içinde eşzamanlılık, kilit dosyasıyla npm önbelleği ve yeniden kullanım ekle. Workflow sözdizimini doğrula ve CI commit'ini oluştur.
- [x] Geçersiz SemVer, farklı commit, main dışı commit, sürüm tutarsızlığı, eksik CHANGELOG ve paket allowlist'i için regresyon testleri ekle. `terminal/ci/` altında doğrulama ve paketlemeyi uygula.
- [x] `release.yml` içinde etiketi, testleri, paketi ve taslak yayın işini sırala. Aynı etiketin işlemlerini sırala. Mevcut taslak veya yayımlanmış kayıt varsa dur. Yayın işi kaynak checkout'u yapmaz.
- [x] Ayrı temiz klonda tip, birim, Synapse ve PTY testlerini çalıştır. Paketi ayrı dizinde açıp checksum, arşiv üyeleri, kurulum ve yardım komutunu doğrula.
- [x] README, CI/CD kılavuzu ve eski tarifin yönlendirmesini güncelle. Kullanıcının PR, gerçek koşu, ruleset, etiket ve yayın adımlarını belgeleyip ilgili commit'leri ayır.
