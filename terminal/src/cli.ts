import { createInterface } from 'node:readline/promises';
import type { Interface } from 'node:readline/promises';
import { clearLine, cursorTo } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';
import { Heartwood } from './client.ts';
import { MatrixHttp, login, register } from './matrix.ts';
import { deviceCode, safeText } from './policy.ts';
import { Profile } from './profile.ts';
import type { ChatLine } from './chat-feed.ts';
import { HistoryNavigator } from './history-navigation.ts';
import type { SendResult } from './send-attempts.ts';
import { ConversationList } from './conversation-list.ts';
import { LiveRecovery } from './connection.ts';

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
/sohbetler                    Karşı tarafı ve cihaz durumunu listele
/sohbet [numara|!oda]         Sohbeti aç. Tek odan varsa seçim gerekmez.
/durum !oda                   Megolm ve güncel cihaz doğrulaması
/gonder !oda MESAJ            Şifreli metin gönder
/tekrar !oda                  Sonucu belirsiz gönderimi tekrar dene
/gecmis !oda                  Son 50 olayı al ve doğrulanmış metni çöz
/onceki !oda                  Daha eski sayfayı aç. Canlı sohbetten /geri ile dön.
/cikis                        Profili kapat`;

function report(error: unknown): void {
  console.error(safeText(error instanceof Error ? error.message : 'Beklenmeyen hata.'));
}

function chatText(line: ChatLine): string {
  return safeText(`${line.sender}  ${line.body ?? '[çözülemedi veya cihaz doğrulanmadı]'}`);
}

async function sendWithStatus(action: () => Promise<SendResult>, retry = false): Promise<void> {
  console.log(retry ? 'Yeniden deneniyor…' : 'Gönderiliyor…');
  const result = await action();
  console.log(result.status === 'accepted' ? 'Şifreli olay sunucu tarafından kabul edildi.' :
    'Gönderim sonucu belirsiz. Aynı gönderimi /tekrar ile dene.');
}

async function liveChat(client: Heartwood, reader: Interface, room: string, signal: AbortSignal,
  expectedPeer?: string): Promise<boolean> {
  const live = await client.openLive(room, expectedPeer);
  if (signal.aborted) return true;
  console.log('Bağlı. Sohbet açık. /tekrar, /yenile, /geri veya /cikis kullanabilirsin.');
  for (const line of live.initial) console.log(chatText(line));

  let waiting = false;
  let sending = false;
  let pending: Promise<void> | undefined;
  const recovery = new LiveRecovery();
  const polling = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay: number | undefined = 1500;
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
      const lines = (await client.http.withSignal(polling.signal, live.refresh)).map(chatText);
      const update = recovery.success(live.catchingUp);
      delay = update.delay;
      if (update.status) lines.unshift(update.status);
      show(lines);
    } catch (error) {
      if (polling.signal.aborted || signal.aborted) return;
      const update = recovery.fail(error);
      delay = update.delay;
      if (update.status) show([update.status, safeText(error instanceof Error ? error.message : 'Beklenmeyen hata.')]);
    }
  }

  function schedule(): void {
    clearTimeout(timer);
    if (sending || pending || signal.aborted || polling.signal.aborted || delay === undefined) return;
    timer = setTimeout(() => {
      pending = refresh().finally(() => {
        pending = undefined;
        schedule();
      });
    }, delay);
  }

  try {
    schedule();
    while (!signal.aborted) {
      waiting = true;
      const line = await reader.question('sohbet> ', {signal}).catch(() => '/cikis');
      waiting = false;
      const message = line.trim();
      if (message === '/geri') return false;
      if (message === '/cikis') return true;
      if (!message) continue;
      if (message === '/yenile') {
        recovery.resume();
        delay = 0;
        schedule();
        continue;
      }
      sending = true;
      clearTimeout(timer);
      try {
        await pending;
        if (signal.aborted) return true;
        if (message === '/tekrar') await sendWithStatus(live.retry, true);
        else await sendWithStatus(() => live.send(message));
      } catch (error) { report(error); }
      finally { sending = false; schedule(); }
    }
    return true;
  } finally {
    clearTimeout(timer);
    polling.abort();
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

async function shell(client: Heartwood, closed: AbortController): Promise<void> {
  const history = new HistoryNavigator((room, before) => client.historyPage(room, before));
  const conversations = new ConversationList();
  const reader = createInterface({ input: stdin, output: stdout, terminal: true, historySize: 0 });
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
          case '/sohbetler': {
            const {rooms, unavailable} = await client.conversations();
            for (const {number, peer, verified} of conversations.replace(rooms)) {
              const status = verified === undefined ? 'cihaz durumu bilinmiyor' :
                verified ? 'cihaz doğrulandı' : 'cihaz doğrulanmadı';
              console.log(safeText(`${number}. ${peer} · ${status}`));
            }
            if (rooms.length === 0) console.log('Erişilebilir sohbet yok.');
            if (unavailable > 0) console.log(`${unavailable} oda listelenemedi.`);
            break;
          }
          case '/sohbet': {
            if (target.startsWith('!')) {
              if (await liveChat(client, reader, target, closed.signal)) return;
              break;
            }
            const selected = target ? conversations.select(target) : undefined;
            const rooms = selected ? [selected.room] : await client.rooms();
            if (!rooms.length) throw new Error('Önce bir sohbet davetini kabul et.');
            if (rooms.length > 1) throw new Error('Odayı seçmek için /sohbetler kullan.');
            if (await liveChat(client, reader, rooms[0], closed.signal, selected?.peer)) return;
            break;
          }
          case '/durum': {
            const {peer, verified} = await client.status(target);
            console.log(safeText(`${peer} · Megolm · ${verified ? 'cihaz doğrulandı' : 'cihaz doğrulanmadı'}`));
            break;
          }
          case '/gonder': {
            const message = /^\S+\s+\S+\s+(.+)$/u.exec(line.trim())?.[1] ?? '';
            await sendWithStatus(() => client.send(target, message));
            break;
          }
          case '/tekrar': await sendWithStatus(() => client.retrySend(target), true); break;
          case '/gecmis':
          case '/onceki': {
            const result = await (command === '/gecmis' ? history.latest(target) : history.older(target));
            console.log(`Geçmiş sayfası ${result.page}`);
            if (result.lines.length === 0) console.log('Bu sayfada gösterilebilir mesaj yok.');
            for (const event of result.lines) console.log(chatText(event));
            if (result.hasMore) console.log('Daha eski olaylar için /onceki !oda kullan.');
            else console.log('Daha eski olay yok.');
            break;
          }
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
  const closed = new AbortController();
  const http = new MatrixHttp(server, closed.signal);
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
    await shell(client, closed);
  } finally {
    client?.close();
    await profile.close();
  }
}

main().catch(error => { report(error); process.exitCode = 1; });
