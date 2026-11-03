/** ANSI styling aligned with the app zinc/violet palette (see src/index.css). */

const BORDER_CHARS = new Set('┌┐└┘├┤┬┴┼─│╭╮╰╯'.split(''));

export const t = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  /** zinc-100 */
  fg: '\x1b[38;5;252m',
  /** zinc-400 */
  muted: '\x1b[38;5;245m',
  dimFg: '\x1b[38;5;240m',
  /** violet-400 */
  accent: '\x1b[38;5;141m',
  /** violet-300 */
  violet: '\x1b[38;5;183m',
  /** fuchsia-300 */
  violetLight: '\x1b[38;5;213m',
  /** violet-600 */
  violetDeep: '\x1b[38;5;135m',
  fuchsia: '\x1b[38;5;177m',
  /** violet-500 borders */
  border: '\x1b[38;5;99m',
  /** markdown code — violet-300 on zinc-900 */
  code: '\x1b[38;5;183m',
  codeBg: '\x1b[48;5;235m',
  link: '\x1b[38;5;177m',
  label: '\x1b[38;5;141m',
  assistant: '\x1b[1;38;5;183m',
  brand: '\x1b[1;38;5;213m',
  success: '\x1b[38;5;141m',
  warn: '\x1b[38;5;220m',
  error: '\x1b[38;5;203m',
};

export function terminalColorsEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  const force = process.env.FORCE_COLOR;
  if (force === '1' || force === '2' || force === '3' || force === 'true') return true;
  return Boolean(process.stdout.isTTY);
}

export function paint(codes: string, text: string): string {
  if (!terminalColorsEnabled()) return text;
  const body = codes.replace(/m$/, '');
  return `\x1b[${body}m${text}${t.reset}`;
}

export function initTerminalTheme(): void {
  /* Hook for future global TTY setup; palette is applied at write time. */
}

/** Color box-drawing borders violet; optional row indexes use bold violetLight for cell text. */
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
      out += paint('38;5;99', ch);
    } else {
      out += paint(emphasizeContent ? '1;38;5;213' : '38;5;252', ch);
    }
  }
  return out;
}

/** Stacked key: value blocks (narrow terminal tables). */
export function colorizeLabeledBlock(text: string): string {
  if (!terminalColorsEnabled()) return text;
  const parts = text.split(/\n(─{8,})\n/);
  const blocks: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (/^─{8,}$/.test(part)) {
      blocks.push(paint('38;5;99', part));
      continue;
    }
    blocks.push(
      part
        .split('\n')
        .map((line) => {
          const idx = line.indexOf(': ');
          if (idx === -1) return paint('38;5;252', line);
          return (
            paint('38;5;141', line.slice(0, idx + 1)) + paint('38;5;252', line.slice(idx + 1))
          );
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
      if (line.startsWith('│ ')) return paint('38;5;245', line);
      if (line.startsWith('• ') || /^\d+\.\s/.test(line)) {
        return paint('38;5;213', line.slice(0, 2)) + paint('38;5;252', line.slice(2));
      }
      if (/^─+$/.test(line)) return paint('38;5;99', line);
      return paint('38;5;252', line);
    })
    .join('\n')}${t.reset}`;
}

export function colorizeToolApprovalCard(card: string): string {
  if (!terminalColorsEnabled()) return card;
  return colorizeBoxDrawing(card, { emphasizeRows: new Set([1]) });
}

/** Full reset + home (like Ctrl+L / clear). */
export function clearChatScreen(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write('\x1bc');
}

export function writeChatBanner(title: string, subtitle?: string): void {
  const w = Math.min(56, process.stdout.columns || 56);
  const rule = '─'.repeat(w);
  if (terminalColorsEnabled()) {
    process.stdout.write(`\n${paint('1;38;5;213', `◆ ${title}`)}\n`);
    if (subtitle) {
      process.stdout.write(`${paint('38;5;245', subtitle)}\n`);
    }
    process.stdout.write(`${paint('38;5;99', rule)}\n\n`);
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
    process.stdout.write(`${paint('38;5;141', label)} ${paint('38;5;252', text)}\n`);
    return;
  }
  process.stdout.write(`${label} ${text}\n`);
}

export function writeBrandHeader(title: string): void {
  if (terminalColorsEnabled()) {
    process.stdout.write(`${paint('1;38;5;213', title)}\n`);
    return;
  }
  process.stdout.write(`${title}\n`);
}
