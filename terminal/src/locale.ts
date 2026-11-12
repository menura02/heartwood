import { aliases } from './commands.ts';
import { HeartwoodError } from './failures.ts';

export type Language = 'en' | 'tr';

const en = {
  help: `Usage: npm start -- [--lang en|tr] <register|login> <profile> <server> <username>
Example: npm start -- login alice http://127.0.0.1:18008 alice
Diagnostics: npm start -- doctor [server]
Guided setup: npm start -- onboard
Set HEARTWOOD_LANG to choose a default language.

/help                              Show commands
/guide                             Check the next setup step
/identity                          Show your device code
/invite @user:server               Invite someone to a private chat
/requests                          List pending invitations
/accept !room                      Accept an invitation
/reject !room                      Reject an invitation
/block @user:server                Block the user and leave their rooms
/verify @user:server CODE          Pin the full code you compared on a trusted channel
/rooms                             List joined room IDs
/conversations                     List peers and device verification status
/chat [number|!room]               Open a chat. No selection needed for one room.
/status !room                      Show Megolm and device verification status
/send !room MESSAGE                Send encrypted text
/retry !room                       Retry a send with an unknown outcome
/pending                           List rooms with an unknown send outcome
/discard !room                     Confirm dropping local tracking for a send
/history !room                     Read the latest 50 events and decrypt verified text
/older !room                       Read the previous page
/exit                              Close the profile

In chat, type a message to send it. Use /back to return or /refresh to resume live reads.`,
  aliases: 'Turkish aliases also work in either language:',
  startupAliases: 'Startup aliases: register (kayıt, kayit), login (giriş, giris).',
  invalidCommand: 'Invalid command. Use --help for usage.',
  interactiveRequired: 'An interactive terminal is required for secret input.',
  passphraseMismatch: 'Store passphrases do not match.',
  accountPassword: 'Account password: ',
  registrationToken: 'Registration token: ',
  accountCreated: 'Account created.',
  storePassphrase: 'Local crypto store passphrase: ',
  confirmPassphrase: 'Repeat the store passphrase: ',
  signedIn: 'Signed in as {user}. Use /help for commands.',
  identity: 'Account {user} · device {device}',
  compareCode: 'Compare the full code on a trusted second channel.',
  accepted: 'Invitation accepted.',
  rejected: 'Invitation rejected.',
  blocked: 'User blocked.',
  verified: 'Device code verified.',
  deviceUnknown: 'device status unknown',
  deviceVerified: 'device verified',
  deviceUnverified: 'device not verified',
  noConversations: 'No accessible conversations.',
  unavailableRooms: 'Rooms that could not be listed: {count}.',
  acceptFirst: 'Accept a chat invitation first.',
  chooseConversation: 'Use /conversations to choose a room.',
  unknownCommand: 'Unknown command. Use /help to show commands.',
  page: 'History page {page}',
  emptyPage: 'No displayable messages on this page.',
  olderAvailable: 'Use /older !room for older events.',
  noOlder: 'No older events.',
  exitPending: 'Sends with an unknown outcome: {count}. Local tracking ends on exit.',
  undecryptable: '[could not decrypt or device not verified]',
  retrying: 'Retrying…',
  sending: 'Sending…',
  serverAccepted: 'The server accepted the encrypted event.',
  uncertain: 'Send outcome unknown. Use /retry to retry the same send.',
  noPending: 'No sends with an unknown outcome.',
  pendingRoom: '{room} · outcome unknown',
  discardWarning: 'The message may have arrived. Dropping tracking leaves the server message intact.',
  discardPrompt: 'Type yes to drop local tracking: ',
  pendingKept: 'Pending send kept.',
  discarded: 'Local send tracking dropped.',
  liveOpened: 'Connected. Chat open. Use /retry, /refresh, /back, or /exit.',
  chatPrompt: 'chat> ',
  connected: 'Connected.',
  catchingUp: 'Catching up on chat history…',
  paused: 'Live reads paused. Use /refresh to try again.',
  reconnecting: 'Reconnecting…',
  doctorResult: '{level} · {check} · {detail}',
  doctorPass: 'PASS',
  doctorWarn: 'WARN',
  doctorFail: 'FAIL',
  doctorNode: 'Node.js',
  doctorCrypto: 'Matrix crypto',
  doctorProfile: 'Profile directory',
  doctorMatrix: 'Matrix API',
  doctorNodeOk: 'Supported Node.js 24 runtime.',
  doctorNodeBad: 'Use Node.js 24 and rerun doctor.',
  doctorCryptoOk: 'The native Matrix binding loads.',
  doctorCryptoBad: 'The binding did not load in time. Run npm ci on a supported platform.',
  doctorProfileOk: 'The directory reports read, write and traversal access.',
  doctorProfileMissing: 'No profile directory yet. The home directory reports the required access.',
  doctorProfileBad: 'Check that the profile directory or its parent is accessible and writable by your account.',
  doctorMatrixSkipped: 'Server omitted. Pass an address to check connectivity.',
  doctorMatrixOrigin: 'Use an HTTPS server address or a loopback HTTP address.',
  doctorMatrixOk: 'The unauthenticated Matrix versions endpoint responded.',
  doctorMatrixBad: 'Check the server address, network, TLS certificate or local Synapse status.',
  doctorScope: 'These checks cover setup and connectivity. Verify device codes separately.',
  guideIntro: 'Heartwood guided setup. Press Ctrl+C to cancel.',
  guideMode: 'Type register, login, or q to quit: ',
  guideModeInvalid: 'Choose register or login.',
  guideServer: 'Matrix server address (HTTPS or loopback HTTP): ',
  guideProfile: 'Local profile name (lowercase letters, digits, underscores or hyphens): ',
  guideUsername: 'Account username on this server: ',
  guideAccept: 'An invitation is waiting. Use /requests, then /accept !room.',
  guideWait: 'Chat is waiting for the other person to accept your invitation. Use /guide to check again or /exit to leave.',
  guideVerify: 'Chat needs device verification. Use /identity, compare the full codes on a trusted second channel, then use /verify.',
  guideChanged: 'The pinned device has changed. Sending to this device is blocked. Check with the other person on a trusted channel.',
  guideReady: 'A chat has a verified device. Use /conversations and /chat to open it.',
  guideInvite: 'Use /invite @user:server to start a chat, or /requests to check for incoming invitations.',
  guideUnavailable: 'No eligible chat is available. Check the invitation and room membership with the other person.',
  guideBlocked: 'Could not confirm chat readiness. Continue with commands or use /guide to try again.',
  guideTimeout: 'The readiness check timed out. Check the connection with doctor.',
  demoHelp: 'Usage: node lab/demo.ts [--lang en|tr]. Starts a disposable Synapse demo on Linux or WSL and prints selected terminal output.',
} as const;

const tr = {
  help: `Kullanım: npm start -- [--lang en|tr] <register|login> <profil> <sunucu> <kullanıcı>
Örnek: npm start -- --lang tr login alice http://127.0.0.1:18008 alice
Tanılama: npm start -- --lang tr doctor [sunucu]
Yönlendirmeli kurulum: npm start -- --lang tr onboard
Varsayılan dili seçmek için HEARTWOOD_LANG ayarla.

/help                              Komutları göster
/guide                             Sonraki kurulum adımını kontrol et
/identity                          Kendi cihaz kodunu göster
/invite @kullanıcı:sunucu          Özel sohbet isteği gönder
/requests                          Bekleyen istekleri listele
/accept !oda                       İsteği kabul et
/reject !oda                       İsteği reddet
/block @kullanıcı:sunucu           Kullanıcıyı engelle ve ilgili odalardan ayrıl
/verify @kullanıcı:sunucu KOD      Güvenilir kanalda karşılaştırdığın tam kodu sabitle
/rooms                             Katıldığın odaların kimliklerini listele
/conversations                     Karşı tarafı ve cihaz doğrulama durumunu listele
/chat [numara|!oda]                Sohbeti aç. Tek odan varsa seçim gerekmez.
/status !oda                       Megolm ve cihaz doğrulama durumunu göster
/send !oda MESAJ                   Şifreli metin gönder
/retry !oda                        Sonucu belirsiz gönderimi tekrar dene
/pending                           Sonucu belirsiz gönderimlerin odalarını listele
/discard !oda                      Onayla ve yerel gönderim takibini bırak
/history !oda                      Son 50 olayı al ve doğrulanmış metni çöz
/older !oda                        Daha eski sayfayı aç
/exit                              Profili kapat

Sohbette göndermek için mesaj yaz. /back ile dön veya /refresh ile canlı okumayı sürdür.`,
  aliases: 'Türkçe komut eş adları iki dilde de çalışır:',
  startupAliases: 'Başlangıç eş adları: register (kayıt, kayit), login (giriş, giris).',
  invalidCommand: 'Geçersiz komut. --help ile kullanımı göster.',
  interactiveRequired: 'Gizli bilgi girişi için etkileşimli terminal gerekli.',
  passphraseMismatch: 'Depo parolaları eşleşmedi.',
  accountPassword: 'Hesap parolası: ',
  registrationToken: 'Kayıt belirteci: ',
  accountCreated: 'Hesap oluşturuldu.',
  storePassphrase: 'Yerel kripto deposu parolası: ',
  confirmPassphrase: 'Depo parolasını tekrar girin: ',
  signedIn: 'Oturum açık: {user}. Komutlar için /help.',
  identity: 'Hesap {user} · cihaz {device}',
  compareCode: 'Tam kodu güvenilir bir ikinci kanaldan karşılaştır.',
  accepted: 'İstek kabul edildi.',
  rejected: 'İstek reddedildi.',
  blocked: 'Kullanıcı engellendi.',
  verified: 'Cihaz kodu doğrulandı.',
  deviceUnknown: 'cihaz durumu bilinmiyor',
  deviceVerified: 'cihaz doğrulandı',
  deviceUnverified: 'cihaz doğrulanmadı',
  noConversations: 'Erişilebilir sohbet yok.',
  unavailableRooms: 'Listelenemeyen oda sayısı: {count}.',
  acceptFirst: 'Önce bir sohbet davetini kabul et.',
  chooseConversation: 'Odayı seçmek için /conversations kullan.',
  unknownCommand: 'Bilinmeyen komut. /help ile komutları göster.',
  page: 'Geçmiş sayfası {page}',
  emptyPage: 'Bu sayfada gösterilebilir mesaj yok.',
  olderAvailable: 'Daha eski olaylar için /older !oda kullan.',
  noOlder: 'Daha eski olay yok.',
  exitPending: 'Sonucu belirsiz gönderim sayısı: {count}. Çıkışta yerel takip sona eriyor.',
  undecryptable: '[çözülemedi veya cihaz doğrulanmadı]',
  retrying: 'Yeniden deneniyor…',
  sending: 'Gönderiliyor…',
  serverAccepted: 'Şifreli olay sunucu tarafından kabul edildi.',
  uncertain: 'Gönderim sonucu belirsiz. Aynı gönderimi /retry ile dene.',
  noPending: 'Sonucu belirsiz gönderim yok.',
  pendingRoom: '{room} · sonuç belirsiz',
  discardWarning: 'Mesaj ulaşmış olabilir. Takibi bırakınca sunucudaki mesaj kalır.',
  discardPrompt: 'Yerel takibi bırakmak için evet yaz: ',
  pendingKept: 'Bekleyen gönderim korunuyor.',
  discarded: 'Yerel gönderim takibi bırakıldı.',
  liveOpened: 'Bağlı. Sohbet açık. /retry, /refresh, /back veya /exit kullanabilirsin.',
  chatPrompt: 'sohbet> ',
  connected: 'Bağlı.',
  catchingUp: 'Geçmiş tamamlanıyor…',
  paused: 'Canlı okuma durdu. Tekrar denemek için /refresh kullan.',
  reconnecting: 'Yeniden bağlanıyor…',
  doctorResult: '{level} · {check} · {detail}',
  doctorPass: 'BAŞARILI',
  doctorWarn: 'UYARI',
  doctorFail: 'BAŞARISIZ',
  doctorNode: 'Node.js',
  doctorCrypto: 'Matrix kriptografisi',
  doctorProfile: 'Profil dizini',
  doctorMatrix: 'Matrix API',
  doctorNodeOk: 'Desteklenen Node.js 24 çalışıyor.',
  doctorNodeBad: 'Node.js 24 kullanıp doctor komutunu yeniden çalıştır.',
  doctorCryptoOk: 'Yerel Matrix bağlayıcısı yüklenebiliyor.',
  doctorCryptoBad: 'Bağlayıcı zamanında yüklenemedi. Desteklenen bir platformda npm ci çalıştır.',
  doctorProfileOk: 'Dizin okuma, yazma ve erişim izni bildiriyor.',
  doctorProfileMissing: 'Henüz profil dizini yok. Ana dizin gerekli erişimi bildiriyor.',
  doctorProfileBad: 'Profil dizinine veya üst dizinine hesabınla erişip yazabildiğini kontrol et.',
  doctorMatrixSkipped: 'Sunucu verilmedi. Bağlantıyı denetlemek için bir adres gir.',
  doctorMatrixOrigin: 'HTTPS veya yerel geri döngü HTTP adresi kullan.',
  doctorMatrixOk: 'Kimlik doğrulaması gerektirmeyen Matrix sürüm uç noktası yanıt verdi.',
  doctorMatrixBad: 'Sunucu adresini, ağı, TLS sertifikasını veya yerel Synapse durumunu kontrol et.',
  doctorScope: 'Bu denetimler kurulum ve bağlantıyı kapsar. Cihaz kodlarını ayrıca doğrula.',
  guideIntro: 'Heartwood yönlendirmeli kurulum. İptal etmek için Ctrl+C’ye bas.',
  guideMode: 'Kayıt için register, giriş için login, çıkmak için q yaz: ',
  guideModeInvalid: 'register veya login seç.',
  guideServer: 'Matrix sunucu adresi (HTTPS veya yerel geri döngü HTTP): ',
  guideProfile: 'Yerel profil adı (küçük harf, rakam, alt çizgi veya kısa çizgi): ',
  guideUsername: 'Bu sunucudaki hesap kullanıcı adı: ',
  guideAccept: 'Bir davet bekliyor. /requests, ardından /accept !oda kullan.',
  guideWait: 'Sohbet karşı tarafın daveti kabul etmesini bekliyor. Yeniden kontrol için /guide, çıkmak için /exit kullan.',
  guideVerify: 'Sohbet için cihaz doğrulaması gerekli. /identity ile tam kodları güvenilir bir ikinci kanalda karşılaştır, ardından /verify kullan.',
  guideChanged: 'Sabitlenen cihaz değişti. Bu cihaza gönderim engellendi. Karşı tarafla güvenilir bir kanaldan kontrol et.',
  guideReady: 'Cihazı doğrulanmış bir sohbet var. Açmak için /conversations ve /chat kullan.',
  guideInvite: 'Sohbet başlatmak için /invite @kullanıcı:sunucu, gelen davetlere bakmak için /requests kullan.',
  guideUnavailable: 'Uygun sohbet yok. Daveti ve oda üyeliğini karşı tarafla kontrol et.',
  guideBlocked: 'Sohbetin hazır olduğu doğrulanamadı. Komutlarla devam et veya /guide ile yeniden dene.',
  guideTimeout: 'Hazırlık denetimi zaman aşımına uğradı. Bağlantıyı doctor ile kontrol et.',
  demoHelp: 'Kullanım: node lab/demo.ts [--lang en|tr]. Linux veya WSL’de geçici bir Synapse demosu başlatır ve seçilen terminal çıktısını gösterir.',
} satisfies Record<keyof typeof en, string>;

export const catalog = {en, tr};
type Message = keyof typeof en;
type Placeholders<T> = T extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

export function interpolate(template: string, fields?: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g,
    (placeholder, field: string) => String(fields?.[field] ?? placeholder));
}

export function translator(language: Language) {
  function text<K extends Message>(key: K,
    ...args: Placeholders<typeof en[K]> extends never ? [] : [Record<Placeholders<typeof en[K]>, string | number>]
  ): string {
    const fields: Record<string, string | number> | undefined = args[0];
    return interpolate(catalog[language][key] || en[key], fields);
  }
  function help(): string {
    const legacy = Object.entries(aliases).map(([name, alias]) => `${name} = ${alias}`).join('\n');
    return `${text('help')}\n\n${text('aliases')}\n${text('startupAliases')}\n${legacy}`;
  }
  return {language, text, help};
}

export type Translator = ReturnType<typeof translator>;

export function selectLanguage(input: readonly string[], env?: string): {language: Language; args: string[]} {
  const args: string[] = [];
  let explicit: string | undefined;
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== '--lang') {
      args.push(input[i]);
      continue;
    }
    const value = input[++i];
    if (explicit !== undefined || (value !== 'en' && value !== 'tr')) {
      throw new HeartwoodError('invalidLanguage');
    }
    explicit = value;
  }
  const language = explicit ?? env ?? 'en';
  if (language !== 'en' && language !== 'tr') throw new HeartwoodError('invalidLanguage');
  return {language, args};
}
