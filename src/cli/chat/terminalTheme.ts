/** ANSI styling — bold magenta / violet (standard SGR for broad terminal support). */

const BORDER_CHARS = new Set('┌┐└┘├┤┬┴┼─│╭╮╰╯'.split(''));

/** SGR parameter strings passed to paint() — no trailing `m`. */
export const sgr = {
  brand: '1;95',
  assistant: '1;95',
  accent: '35',
  bright: '95',
  body: '35',
  muted: '2;35',
  border: '35',
  label: '1;35',
  bullet: '95',
  warn: '33',
  error: '31',
};

export const t = {
  reset: '\x1b[0m',
};

export function terminalColorsEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  const force = process.env.FORCE_COLOR;
  if (force === '1' || force === '2' || force === '3' || force === 'true') return true;
  if (process.env.TERM === 'dumb') return false;
  return Boolean(process.stdout.isTTY || process.stderr.isTTY);
}

export function paint(codes: string, text: string): string {
  if (!terminalColorsEnabled()) return text;
  const body = codes.replace(/m$/, '');
  return `\x1b[${body}m${text}${t.reset}`;
}

export function initTerminalTheme(): void {
  /* Applied via initCliTheme + prepareCliColorEnv in bin/mcp-detective.js */
}

export function colorizeBoxDrawing(
  text: string,
  options?: { titleRows?: Set<number> },
): string {
  if (!terminalColorsEnabled()) return text;
  const titleRows = options?.titleRows ?? new Set<number>();
  const lines = text.split('\n');
  const out = lines.map((line, row) => colorizeBoxLine(line, titleRows.has(row)));
  return `${out.join('\n')}${t.reset}`;
}

/** Violet box borders; optional title row accent; inner text plain. */
function colorizeBoxLine(line: string, titleRow: boolean): string {
  let out = '';
  for (const ch of line) {
    if (BORDER_CHARS.has(ch)) {
      out += paint(sgr.border, ch);
    } else if (titleRow) {
      out += paint(sgr.brand, ch);
    } else {
      out += ch;
    }
  }
  return out;
}

export function colorizeToolApprovalCard(card: string): string {
  if (!terminalColorsEnabled()) return card;
  return colorizeBoxDrawing(card, { titleRows: new Set([1]) });
}

export function clearChatScreen(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write('\x1bc');
}

export function writeChatBanner(title: string, subtitle?: string): void {
  const w = Math.min(56, process.stdout.columns || 56);
  const rule = '─'.repeat(w);
  if (terminalColorsEnabled()) {
    process.stdout.write(`\n${paint(sgr.brand, `◆ ${title}`)}\n`);
    if (subtitle) {
      process.stdout.write(`${paint(sgr.muted, subtitle)}\n`);
    }
    process.stdout.write(`${paint(sgr.border, rule)}\n\n`);
    return;
  }
  process.stdout.write(`\n◆ ${title}\n`);
  if (subtitle) {
    process.stdout.write(`${subtitle}\n`);
  }
  process.stdout.write(`${rule}\n\n`);
}

export function writeThemedLine(label: string, text: string): void {
  if (terminalColorsEnabled()) {
    process.stdout.write(`${paint(sgr.label, label)} ${paint(sgr.bright, text)}\n`);
    return;
  }
  process.stdout.write(`${label} ${text}\n`);
}

export function writeBrandHeader(title: string): void {
  if (terminalColorsEnabled()) {
    process.stdout.write(`${paint(sgr.brand, title)}\n`);
    return;
  }
  process.stdout.write(`${title}\n`);
}
