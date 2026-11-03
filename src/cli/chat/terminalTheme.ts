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
  return `\x1b[${codes}m${text}${t.reset}`;
}

/** Full reset + home (like Ctrl+L / clear). */
export function clearChatScreen(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write('\x1bc');
}

export function writeChatBanner(title: string, subtitle?: string): void {
  const line = paint('38;5;141', '◆') + ' ' + paint('1;38;5;252', title);
  process.stdout.write(`\n${line}\n`);
  if (subtitle) {
    process.stdout.write(`${paint('2;38;5;245', subtitle)}\n`);
  }
  process.stdout.write(`${paint('38;5;240', '─'.repeat(Math.min(48, process.stdout.columns || 48)))}\n\n`);
}
