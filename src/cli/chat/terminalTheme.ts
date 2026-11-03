/** ANSI styling aligned with the app zinc/violet palette (see src/index.css). */
export const t = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  fg: '\x1b[38;5;252m',
  muted: '\x1b[38;5;245m',
  dimFg: '\x1b[38;5;240m',
  accent: '\x1b[38;5;141m',
  violet: '\x1b[38;5;183m',
  success: '\x1b[38;5;141m',
  warn: '\x1b[38;5;220m',
  error: '\x1b[38;5;203m',
  codeBg: '\x1b[48;5;235m',
};

export function useTerminalColor(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

export function paint(codes: string, text: string): string {
  if (!useTerminalColor()) return text;
  const body = codes.endsWith('m') ? codes.slice(0, -1) : codes;
  return `\x1b[${body}m${text}${t.reset}`;
}

/** Full reset + home (like Ctrl+L / clear). */
export function clearChatScreen(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write('\x1bc');
}

export function writeChatBanner(title: string, subtitle?: string): void {
  process.stdout.write(`\n◆ ${title}\n`);
  if (subtitle) {
    process.stdout.write(`${subtitle}\n`);
  }
  process.stdout.write(`${'─'.repeat(Math.min(48, process.stdout.columns || 48))}\n\n`);
}
