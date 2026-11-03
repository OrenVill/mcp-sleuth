import type { GlobalCliFlags } from './contracts';

function normalizeCommand(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === 'tui') return 'chat';
  return raw;
}

export function parseArgv(argv: string[]): {
  command: string | null;
  rest: string[];
  flags: GlobalCliFlags;
} {
  const flags: GlobalCliFlags = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      flags.json = true;
      continue;
    }
    if (arg === '--discover') {
      flags.discover = true;
      continue;
    }
    if (arg === '-o' || arg === '--output') {
      flags.output = argv[++i];
      continue;
    }
    if (arg === '--server') {
      flags.server = argv[++i];
      continue;
    }
    if (arg === '--passphrase-file') {
      flags.passphraseFile = argv[++i];
      continue;
    }
    if (arg === '--provider-id') {
      flags.providerId = argv[++i];
      continue;
    }
    if (arg === '--servers') {
      flags.servers = argv[++i];
      continue;
    }
    if (arg.startsWith('-')) {
      continue;
    }
    positionals.push(arg);
  }

  const command = normalizeCommand(positionals[0] ?? null);
  const rest = positionals.slice(1);

  return { command, rest, flags };
}

export function isKnownCommand(command: string | null): boolean {
  if (!command) return false;
  return (
    command === 'help' ||
    command === 'chat' ||
    command === 'readiness' ||
    command === 'audit' ||
    command === 'export' ||
    command === 'call' ||
    command === 'provider' ||
    command === 'server'
  );
}
