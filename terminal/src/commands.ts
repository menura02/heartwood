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

const searchCommands = ['/search', '/search-next', '/search-prev'] as const;
export type Command = keyof typeof aliases | typeof searchCommands[number];
const commands = new Map<string, Command>();
for (const name of Object.keys(aliases) as (keyof typeof aliases)[]) {
  commands.set(name, name);
  commands.set(aliases[name], name);
}
for (const name of searchCommands) commands.set(name, name);

export type CommandContext = 'main' | 'chat';
const chatCommands = new Set<Command>(['/help', '/history', '/older', '/status', '/back', '/exit',
  '/refresh', '/retry', '/pending', '/discard', '/send', ...searchCommands]);

export function available(command: Command, context: CommandContext): boolean {
  return context === 'chat' ? chatCommands.has(command) :
    command !== '/back' && command !== '/refresh' && !searchCommands.some(item => item === command);
}

export function completeCommand(line: string, cursor: number, context: CommandContext): [string[], string] {
  if (cursor !== line.length || !/^\/[a-z-]*$/.test(line)) return [[], line];
  const candidates = [...commands].filter(([name, command]) => name.startsWith(line) && available(command, context));
  const canonical = candidates.filter(([name, command]) => name === command).map(([name]) => name);
  const legacy = candidates.filter(([name, command]) => name !== command).map(([name]) => name);
  return [canonical.length ? canonical : legacy, line];
}

export function commandUsage(command: Command, context: CommandContext): string {
  if (context === 'chat') {
    if (command === '/search') return '/search TEXT';
    if (command === '/send') return '/send MESSAGE';
    return command;
  }
  switch (command) {
    case '/invite': case '/block': return `${command} @user:server`;
    case '/verify': return '/verify @user:server CODE';
    case '/chat': return '/chat [number|!ROOM]';
    case '/send': return '/send !ROOM MESSAGE';
    case '/accept': case '/reject': case '/status': case '/retry':
    case '/discard': case '/history': case '/older': return `${command} !ROOM`;
    default: return command;
  }
}

export function validArguments(command: Command, args: string, context: CommandContext): boolean {
  if (context === 'chat') return command === '/search' ? args.length > 0 && args.length <= 256 :
    command === '/send' ? args.length > 0 : !args;
  switch (command) {
    case '/invite': case '/block': return /^@\S+:\S+$/.test(args);
    case '/verify': return /^@\S+:\S+[ \t]+\S/.test(args);
    case '/chat': return !args || /^(?:[1-9][0-9]*|!\S+)$/.test(args);
    case '/send': return /^!\S+\s+\S/.test(args);
    case '/accept': case '/reject': case '/status': case '/retry':
    case '/discard': case '/history': case '/older': return /^!\S+$/.test(args);
    default: return !args;
  }
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
