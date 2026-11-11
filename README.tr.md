[English](README.md) | [Türkçe](README.tr.md)

# Heartwood

Heartwood, aynı Matrix sunucusundaki iki kişi arasında şifreli metin sohbeti sağlayan, gizlilik odaklı bir TypeScript terminal istemcisidir. Portföy projesi cihaz doğrulaması, canlı sohbet, mesaj geçmişi, yerel Synapse laboratuvarı ve tekrarlanabilir testleri içerir.

Yeni bir çalışma kopyasında istemciyi kurmak ve Türkçe yardımı açmak için Node.js 24.20.0 kullan.

```sh
cd terminal
npm ci
npm start -- --lang tr --help
```

Terminal arayüzü varsayılan olarak İngilizcedir. Sonraki çalıştırmalarda Türkçeyi varsayılan yapmak için `HEARTWOOD_LANG=tr` ayarla. `--lang en|tr` seçeneği ortam değişkeninden önceliklidir. Arayüz dili ne olursa olsun her iki dilin komutları çalışır. [Kurulum ve yerel Synapse gösterimi](docs/portfolio/terminal-guide.tr.md)

## İstemci kullanımı

- `/sohbetler` karşı tarafı ve cihaz güven durumunu listeler. `/sohbet 1` ile numaralı sohbeti aç. Canlı sohbet bağlantı geri geldiğinde eksik olayları tamamlar. Sonucu belirsiz gönderimi aynı şifreli işlemle yeniden denemek için `/tekrar` kullan. [Güvenilirlik tasarımı](docs/portfolio/reliability-design.tr.md)
- `/gecmis !ODA` ana komut ekranında en fazla 50 Matrix olayı içeren son sayfayı okur. `/onceki !ODA` aynı odada daha eski sayfaya geçer. [Geçmiş komutları](docs/portfolio/terminal-guide.tr.md#eski-mesajları-oku)
- `/bekleyenler` belirsiz gönderimleri olan odaları listeler. `/vazgec` onayla yerel takibi bırakır. `/kimlik` hesap, cihaz ve gruplu tam doğrulama kodunu gösterir. [Teknik tasarım](docs/portfolio/technical-design.tr.md)

## Testler ve dağıtım

CI, Windows ve Linux'ta tip kontrolü ve birim testlerini çalıştırır. Ayrı bir Linux işi atılabilir Synapse ve gerçek PTY senaryolarını çalıştırır. [CI iş akışı](.github/workflows/terminal.yml)

Sürüm iş akışı aynı kontrolleri etiketlenen commit üzerinde çalıştırır. Başarılı koşu GitHub Release taslağı için kaynak ZIP'i, SHA-256 ve iki dilli sürüm notları hazırlar. [CI/CD ve yayın adımları](docs/portfolio/ci-cd-guide.tr.md) · [Kaynak paket kurulumu](docs/portfolio/distribution.tr.md) · [Değişiklik kaydı](CHANGELOG.tr.md)

Gerçek hesap bilgilerini, anahtarları, kullanıcı profillerini ve özel mesajları depoya ekleme. [Katkı rehberi](CONTRIBUTING.tr.md) · [Belge arşivi](docs/archive/README.tr.md)
