export const aliases = {
  '/help': '/yardim',
  '/guide': '/rehber',
  '/identity': '/kimlik',
  '/invite': '/davet',
  '/requests': '/istekler',
  '/accept': '/kabul',
  '/reject': '/ret',
  '/block': '/engelle',
  '/verify': '/dogrula',
  '/rooms': '/odalar',
  '/conversations': '/sohbetler',
  '/chat': '/sohbet',
  '/status': '/durum',
  '/send': '/gonder',
  '/retry': '/tekrar',
  '/pending': '/bekleyenler',
  '/discard': '/vazgec',
  '/history': '/gecmis',
  '/older': '/onceki',
  '/exit': '/cikis',
  '/back': '/geri',
  '/refresh': '/yenile',
} as const;

export type Command = keyof typeof aliases;
const commands = new Map<string, Command>();
for (const name of Object.keys(aliases) as Command[]) {
  commands.set(name, name);
  commands.set(aliases[name], name);
}

export function commandName(input: string): Command | undefined {
  return commands.get(input);
}

export function startupMode(input: string): 'register' | 'login' | undefined {
  if (['register', 'kayıt', 'kayit'].includes(input)) return 'register';
  if (['login', 'giriş', 'giris'].includes(input)) return 'login';
  return undefined;
}

export function verificationCode(line: string): string {
  return /^\s*\S+[ \t]+\S+[ \t]+([^\r\n]*)$/u.exec(line)?.[1] ?? '';
}
