# Heartwood

Heartwood, aynı Matrix sunucusundaki iki kişi arasında şifreli metin sohbeti sağlayan, gizlilik odaklı bir TypeScript terminal uygulamasıdır. Portföy kapsamı cihaz doğrulaması, canlı sohbet, geçmiş, yerel Synapse laboratuvarı ve tekrarlanabilir testleri içerir.

İstemci Node 24.20.0 ile terminalde çalışır. Temiz checkout'ta `cd terminal`, `npm ci` ve `npm start -- --help` çalıştır. [Kurulum ve yerel Synapse gösterimi](docs/portfolio/terminal-guide.md)

## Mevcut durum

TypeScript istemcisi `terminal/` altında. CI, Windows ve Linux'ta tip kontrolü ve birim testleri için yapılandırıldı. Ayrı Linux işi atılabilir Synapse ve gerçek PTY senaryolarını çalıştırır. [CI iş akışı](.github/workflows/terminal.yml)

Sürüm etiketi aynı kontrolleri etiketlenen commit üzerinde çalıştırır. Testler geçerse kaynak ZIP'i, SHA-256 ve CHANGELOG notlarıyla bir GitHub Release taslağı hazırlar. [CI/CD ve yayın adımları](docs/portfolio/ci-cd-guide.md) · [Kaynak paket kurulumu](docs/portfolio/distribution.md)

Ana komut ekranında `/gecmis !oda` son 50 Matrix olayını okur. `/onceki !oda` aynı odada daha eski sayfaya geçer. [Geçmiş komutları](docs/portfolio/terminal-guide.md#eski-mesajları-oku)

`/sohbetler` karşı tarafı ve cihaz durumunu listeler. `/sohbet 1` numaralı sohbeti açar. Canlı sohbet bağlantı geri geldiğinde eksik olayları Matrix imleçleriyle tamamlar. Sonucu belirsiz gönderimler `/tekrar` ile aynı şifreli işlem üzerinden denenebilir. [Güvenilirlik tasarımı](docs/portfolio/reliability-design.md)

`/bekleyenler` belirsiz işlemlerin odalarını gösterir. `/vazgec` onayla yerel takibi bırakır. `/kimlik` hesap, cihaz ve gruplu tam doğrulama kodunu gösterir. [Teknik tasarım](docs/portfolio/technical-design.md)

Gerçek hesap bilgileri, anahtarlar, kullanıcı profilleri ve özel mesajlar depoya eklenmez.
