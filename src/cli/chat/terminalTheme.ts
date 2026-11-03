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
  options?: { emphasizeRows?: Set<number> },
): string {
  if (!terminalColorsEnabled()) return text;
  const emphasizeRows = options?.emphasizeRows ?? new Set<number>();
  const lines = text.split('\n');
  const out = lines.map((line, row) => colorizeBoxLine(line, emphasizeRows.has(row)));
  return `${out.join('\n')}${t.reset}`;
}

function colorizeBoxLine(line: string, emphasizeContent: boolean): string {
  let out = '';
  for (const ch of line) {
    if (BORDER_CHARS.has(ch)) {
      out += paint(sgr.border, ch);
    } else {
      out += paint(emphasizeContent ? sgr.brand : sgr.body, ch);
    }
  }
  return out;
}

export function colorizeLabeledBlock(text: string): string {
  if (!terminalColorsEnabled()) return text;
  const parts = text.split(/\n(─{8,})\n/);
  const blocks: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (/^─{8,}$/.test(part)) {
      blocks.push(paint(sgr.border, part));
      continue;
    }
    blocks.push(
      part
        .split('\n')
        .map((line) => {
          const idx = line.indexOf(': ');
          if (idx === -1) return paint(sgr.body, line);
          return paint(sgr.label, line.slice(0, idx + 1)) + paint(sgr.bright, line.slice(idx + 1));
        })
        .join('\n'),
    );
  }
  return `${blocks.join('\n')}${t.reset}`;
}

export function colorizeAssistantBody(text: string): string {
  if (!terminalColorsEnabled()) return text;
  if (text.includes('┌')) {
    return colorizeBoxDrawing(text, { emphasizeRows: new Set([1]) });
  }
  if (/^[^:\n]+: .+/m.test(text) && text.includes('──')) {
    return colorizeLabeledBlock(text);
  }
  return `${text
    .split('\n')
    .map((line) => {
      if (line.startsWith('│ ')) return paint(sgr.muted, line);
      if (line.startsWith('• ') || /^\d+\.\s/.test(line)) {
        return paint(sgr.bullet, line.slice(0, 2)) + paint(sgr.body, line.slice(2));
      }
      if (/^─+$/.test(line)) return paint(sgr.border, line);
      return paint(sgr.body, line);
    })
    .join('\n')}${t.reset}`;
}

export function colorizeToolApprovalCard(card: string): string {
  if (!terminalColorsEnabled()) return card;
  return colorizeBoxDrawing(card, { emphasizeRows: new Set([1]) });
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
