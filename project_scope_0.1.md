# Project Scope 0.1

Geliştirme kod adı **Heartwood**.

## Amaç

Gizliliğe öncelik veren herkesin kendi hesabını açıp terminalden uçtan uca şifreli bire bir mesajlaşabileceği bir uygulama. Terminal istemcisi, ürünün ilk kullanılabilir sürümüdür.

## MVP kapsamı

- Kullanıcı, terminalden kullanıcı adı ve parolayla kayıt olur ve giriş yapar. Kayıt herkese açıktır. Telefon numarası, e-posta ve yönetici onayı istenmez.
- Kullanıcı, karşı tarafın tam kullanıcı adını girerek sohbet isteği gönderir. Alıcı isteği kabul edebilir, reddedebilir veya göndereni engelleyebilir. Herkese açık kullanıcı dizini bulunmaz.
- İki kullanıcı, terminalde gösterilen doğrulama kodunu karşılaştırarak birbirinin kimliğini doğrular. Doğrulama ve şifreleme hazır olduğunda metin mesajı gönderebilirler.
- Alıcı çevrimdışıyken gönderilen mesaj, yeniden bağlandığında gelir. Kullanıcı aynı cihaz ve yerel profille uygulamayı yeniden açtığında önceki mesajları okuyabilir.

## Roller ve gizlilik

Kayıt olan herkes standart kullanıcıdır. Yönetici rolü, sunucu kurulurken hizmeti işleten kişiye ayrı bir işletim hesabı üzerinden verilir. Yönetici kötüye kullanım nedeniyle hesapları askıya alabilir. Kayıt ve sohbet isteği gönderme sıklığı sınırlandırılır.

Mesaj içeriği istemcide şifrelenir. Yönetici rolü mesajları çözme yetkisi vermez. Sunucu IP adresi, sohbet üyeliği ve mesaj zamanları gibi üst verileri görebilir. Kayıt sırasında bu ayrım kullanıcıya açıklanır.

## Teknik yön ve kapsam dışı

Terminal istemcisi TypeScript ile geliştirilir. Mesajlaşma kendi işlettiğimiz Synapse sunucusu üzerinden yürür ve uçtan uca şifreleme için Matrix SDK kullanılır. Dış erişim HTTPS üzerinden sağlanır.

Web ve mobil arayüzler, grup sohbetleri, dosya paylaşımı, sesli ve görüntülü arama ile yeni cihazda kurtarma anahtarıyla geçmişi geri yükleme sonraki sürümlere kalır.

## Kabul ölçütleri

- İki kişi yönetici müdahalesi olmadan kayıt olabilir, sohbet isteğini kabul edebilir, kimliklerini doğrulayabilir ve iki yönde mesaj gönderebilir.
- Reddedilen istek sohbet başlatmaz. Engellenen hesap yeniden istek gönderemez. Standart kullanıcı yönetim işlemlerine erişemez.
- Çevrimdışı alıcı geri döndüğünde mesajı alır. Terminal yeniden açıldığında aynı yerel profilde geçmiş okunabilir.
- Sunucuya iletilen ve sunucuda saklanan mesaj olaylarında açık metin bulunmaz. Şifreleme veya doğrulama hazır değilken istemci gönderimi engeller.
