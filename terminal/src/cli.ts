import { createInterface } from 'node:readline/promises';
import type { Interface } from 'node:readline/promises';
import { clearLine, cursorTo } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';
import { Heartwood } from './client.ts';
import { MatrixHttp, login, register } from './matrix.ts';
import { deviceCode, safeText } from './policy.ts';
import { Profile } from './profile.ts';
import { ChatFeed } from './chat-feed.ts';
import type { ChatLine } from './chat-feed.ts';

const help = `Kullanım: npm start -- <kayıt|giriş> <profil> <sunucu> <kullanıcı>
Örnek: npm start -- giriş alice http://127.0.0.1:8008 alice

/kimlik                      Kendi cihaz kodun
/davet @kullanıcı:sunucu      Özel sohbet isteği
/istekler                     Bekleyen istekler
/kabul !oda                   İsteği kabul et
/ret !oda                     İsteği reddet
/engelle @kullanıcı:sunucu    Kullanıcıyı engelle ve ilgili odalardan ayrıl
/dogrula @kullanıcı:sunucu KOD Güvenilir kanalda karşılaştırdığın tam kodu sabitle
/odalar                       Katıldığın odaların kimlikleri
/sohbet [!oda]                Sohbeti aç. Tek odan varsa oda kimliği gerekmez.
/durum !oda                   Megolm ve güncel cihaz doğrulaması
/gonder !oda MESAJ            Şifreli metin gönder
/gecmis !oda                  Son 50 olayı al ve doğrulanmış metni çöz
/cikis                        Profili kapat`;

function report(error: unknown): void {
  console.error(safeText(error instanceof Error ? error.message : 'Beklenmeyen hata.'));
}

function chatText(line: ChatLine): string {
  return safeText(`${line.sender}  ${line.body ?? '[çözülemedi veya cihaz doğrulanmadı]'}`);
}

async function liveChat(client: Heartwood, reader: Interface, room: string, signal: AbortSignal): Promise<boolean> {
  const feed = new ChatFeed();
  const initial = await client.history(room);
  if (signal.aborted) return true;
  console.log('Sohbet açık. Mesajını yaz ve Enter’a bas. /geri ile dön, /cikis ile kapat.');
  for (const line of feed.update(initial)) console.log(chatText(line));

  let waiting = false;
  let sending = false;
  let pending: Promise<void> | undefined;
  let lastError: string | undefined;
  function show(lines: string[]): void {
    if (!lines.length || signal.aborted) return;
    if (waiting) {
      cursorTo(stdout, 0);
      clearLine(stdout, 0);
    }
    console.log(lines.join('\n'));
    if (waiting) reader.prompt(true);
  }

  async function refresh(): Promise<void> {
    try {
      const lines = feed.update(await client.history(room)).map(chatText);
      if (lastError) lines.unshift('Sohbet güncellendi.');
      lastError = undefined;
      show(lines);
    } catch (error) {
      const message = safeText(error instanceof Error ? error.message : 'Beklenmeyen hata.');
      if (message !== lastError) show([`Sohbet güncellenemedi. ${message}`]);
      lastError = message;
    }
  }

  const timer = setInterval(() => {
    if (sending || pending || signal.aborted) return;
    pending = refresh().finally(() => { pending = undefined; });
  }, 1500);

  try {
    while (!signal.aborted) {
      waiting = true;
      const line = await reader.question('sohbet> ', {signal}).catch(() => '/cikis');
      waiting = false;
      const message = line.trim();
      if (message === '/geri') return false;
      if (message === '/cikis') return true;
      if (!message) continue;
      sending = true;
      try {
        await pending;
        if (signal.aborted) return true;
        await client.send(room, message);
      } catch (error) { report(error); }
      finally { sending = false; }
    }
    return true;
  } finally {
    clearInterval(timer);
    await pending;
  }
}

async function secret(prompt: string): Promise<string> {
  stdout.write(prompt);
  const hidden = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const reader = createInterface({ input: stdin, output: hidden, terminal: true, historySize: 0 });
  const closed = new AbortController();
  reader.once('close', () => closed.abort());
  reader.once('SIGINT', () => reader.close());
  try {
    return await reader.question('', { signal: AbortSignal.any([closed.signal, AbortSignal.timeout(180_000)]) });
  } finally {
    reader.close();
    stdout.write('\n');
  }
}

async function shell(client: Heartwood): Promise<void> {
  const reader = createInterface({ input: stdin, output: stdout, terminal: true, historySize: 0 });
  const closed = new AbortController();
  reader.once('close', () => closed.abort());
  reader.once('SIGINT', () => reader.close());
  try {
    console.log(`Oturum açık: ${safeText(client.identity.user)}. Komutlar için /yardim.`);
    while (true) {
      const line = await reader.question('heartwood> ', {signal: closed.signal}).catch(() => '/cikis');
      const [command, target = '', ...argument] = line.trim().split(/\s+/);
      const value = argument.join(' ');
      try {
        switch (command) {
          case '/yardim': console.log(help); break;
          case '/kimlik': console.log(deviceCode(client.identity)); break;
          case '/davet': console.log(safeText(await client.invite(target))); break;
          case '/istekler':
            for (const {room, peer} of await client.pending()) console.log(safeText(`${room}  ${peer}`));
            break;
          case '/kabul': await client.accept(target); console.log('İstek kabul edildi.'); break;
          case '/ret': await client.reject(target); console.log('İstek reddedildi.'); break;
          case '/engelle': await client.block(target); console.log('Kullanıcı engellendi.'); break;
          case '/dogrula': await client.verify(target, value); console.log('Cihaz kodu doğrulandı.'); break;
          case '/odalar':
            for (const room of await client.rooms()) console.log(safeText(room));
            break;
          case '/sohbet': {
            const rooms = target ? [target] : await client.rooms();
            if (!rooms.length) throw new Error('Önce bir sohbet davetini kabul et.');
            if (rooms.length > 1) throw new Error('Odayı seçmek için /odalar ve /sohbet !oda kullan.');
            if (await liveChat(client, reader, rooms[0], closed.signal)) return;
            break;
          }
          case '/durum': {
            const {peer, verified} = await client.status(target);
            console.log(safeText(`${peer} · Megolm · ${verified ? 'cihaz doğrulandı' : 'cihaz doğrulanmadı'}`));
            break;
          }
          case '/gonder': {
            const message = /^\S+\s+\S+\s+(.+)$/u.exec(line.trim())?.[1] ?? '';
            await client.send(target, message);
            console.log('Şifreli olay sunucu tarafından kabul edildi.');
            break;
          }
          case '/gecmis':
            for (const event of await client.history(target)) {
              console.log(chatText(event));
            }
            break;
          case '/cikis': return;
          case '': break;
          default: console.log('Bilinmeyen komut. /yardim ile komutları göster.');
        }
      } catch (error) { report(error); }
    }
  } finally { reader.close(); }
}

async function main(): Promise<void> {
  const [mode, name, server, username] = process.argv.slice(2);
  if (!mode || mode === '--help') { console.log(help); return; }
  if (!['kayıt', 'giriş', 'kayit', 'giris'].includes(mode) || !name || !server || !username || process.argv.length !== 6) {
    throw new Error('Geçersiz komut. --help ile kullanımı göster.');
  }
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Gizli bilgi girişi için etkileşimli terminal gerekli.');
  const http = new MatrixHttp(server);
  const profile = await Profile.open(name, http.origin, username);
  let client: Heartwood | undefined;
  try {
    const password = await secret('Hesap parolası: ');
    if (mode === 'kayıt' || mode === 'kayit') {
      await register(http, username, password, await secret('Kayıt belirteci: '));
      console.log('Hesap oluşturuldu.');
    }
    const passphrase = await secret('Yerel kripto deposu parolası: ');
    if (!profile.data.identity && passphrase !== await secret('Depo parolasını tekrar girin: ')) {
      throw new Error('Depo parolaları eşleşmedi.');
    }
    client = await Heartwood.open(http, profile, await login(http, username, password, profile.data.device), passphrase);
    await shell(client);
  } finally {
    client?.close();
    await profile.close();
  }
}

main().catch(error => { report(error); process.exitCode = 1; });
