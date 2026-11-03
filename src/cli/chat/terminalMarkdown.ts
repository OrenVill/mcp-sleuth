import { Marked, type RendererObject, type Tokens } from 'marked';
import { wrapPlainLine } from './formatToolArgsDisplay';
import {
  colorizeAssistantBody,
  paint,
  terminalColorsEnabled,
} from './terminalTheme';

function stripAnsi(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 0x1b && value[i + 1] === '[') {
      let j = i + 2;
      while (j < value.length && value[j] !== 'm') j++;
      i = j;
      continue;
    }
    out += value[i]!;
  }
  return out;
}

/** Decode entities common in MCP/LLM text so terminal tables read naturally. */
export function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function resolveMarkdownTableWidth(preferred = 80): number {
  const cols = process.stdout.columns ?? preferred;
  return Math.max(40, cols - 2);
}

function gridLineWidth(columnWidths: number[]): number {
  if (columnWidths.length === 0) return 0;
  const cells = columnWidths.reduce((sum, w) => sum + w + 2, 0);
  return 1 + cells + (columnWidths.length - 1);
}

function shrinkColumnWidths(columnWidths: number[], maxWidth: number): number[] {
  const widths = [...columnWidths];
  const minCol = 3;
  while (gridLineWidth(widths) > maxWidth) {
    let widest = -1;
    let widestSize = minCol;
    for (let i = 0; i < widths.length; i++) {
      if (widths[i]! > widestSize) {
        widestSize = widths[i]!;
        widest = i;
      }
    }
    if (widest < 0 || widestSize <= minCol) break;
    widths[widest] = widestSize - 1;
  }
  return widths;
}

function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

function padCell(
  text: string,
  width: number,
  align: 'left' | 'center' | 'right' | null,
): string {
  const plain = stripAnsi(text);
  const len = plain.length;
  if (len >= width) {
    return plain.length > width ? plain.slice(0, width - 1) + '…' : plain;
  }
  const pad = width - len;
  if (align === 'right') return `${' '.repeat(pad)}${plain}`;
  if (align === 'center') {
    const left = Math.floor(pad / 2);
    return `${' '.repeat(left)}${plain}${' '.repeat(pad - left)}`;
  }
  return `${plain}${' '.repeat(pad)}`;
}

/** Stacked rows for terminals too narrow for a box grid. */
export function formatTerminalTableStacked(
  header: string[],
  rows: string[][],
  maxWidth: number,
): string {
  const blocks: string[] = [];
  const sep = '─'.repeat(Math.min(Math.max(maxWidth, 20), 48));

  for (const row of rows) {
    const lines: string[] = [];
    for (let col = 0; col < header.length; col++) {
      const label = decodeBasicHtmlEntities(stripAnsi(header[col] ?? ''));
      const value = decodeBasicHtmlEntities(stripAnsi(row[col] ?? ''));
      lines.push(...wrapPlainLine(`${label}: ${value}`, maxWidth));
    }
    blocks.push(lines.join('\n'));
  }

  return blocks.join(`\n${sep}\n`);
}

/** Plain-text table layout for the terminal (testable without marked). */
export function formatTerminalTable(
  header: string[],
  rows: string[][],
  align: Array<'left' | 'center' | 'right' | null> = [],
  options?: { maxWidth?: number },
): string {
  if (header.length === 0) return '';

  const maxWidth = options?.maxWidth ?? resolveMarkdownTableWidth();
  const colCount = header.length;
  const naturalWidths = Array.from({ length: colCount }, (_, col) => {
    let max = visibleLength(decodeBasicHtmlEntities(header[col] ?? ''));
    for (const row of rows) {
      max = Math.max(max, visibleLength(decodeBasicHtmlEntities(row[col] ?? '')));
    }
    return Math.min(Math.max(max, 3), 36);
  });

  let widths = naturalWidths;
  if (gridLineWidth(widths) > maxWidth) {
    if (colCount > 3) {
      return formatTerminalTableStacked(header, rows, maxWidth);
    }
    widths = shrinkColumnWidths(widths, maxWidth);
    if (gridLineWidth(widths) > maxWidth) {
      return formatTerminalTableStacked(header, rows, maxWidth);
    }
  }

  const hLine = (left: string, mid: string, right: string, fill: string) => {
    const midSeg = widths.map((w) => fill.repeat(w + 2)).join(mid);
    return `${left}${midSeg}${right}`;
  };

  const headerRow = header.map((h) => decodeBasicHtmlEntities(stripAnsi(h)));
  const rowsPlain = rows.map((row) =>
    row.map((cell) => decodeBasicHtmlEntities(stripAnsi(cell))),
  );

  const rowLine = (cells: string[]) => {
    const body = widths
      .map((width, col) => ` ${padCell(cells[col] ?? '', width, align[col] ?? 'left')} `)
      .join('│');
    return `│${body}│`;
  };

  const lines = [
    hLine('┌', '┬', '┐', '─'),
    rowLine(headerRow),
    hLine('├', '┼', '┤', '─'),
    ...rowsPlain.map((row) => rowLine(row)),
    hLine('└', '┴', '┘', '─'),
  ];
  return lines.join('\n');
}

function stripUnsafeUrl(href: string | null | undefined): string | null {
  const stripped = Array.from(href ?? '')
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join('');
  if (/^(?:https?:|mailto:|#)/i.test(stripped)) return stripped;
  return null;
}

const renderer: RendererObject = {
  html({ text }: Tokens.HTML | Tokens.Tag): string {
    return text;
  },
  heading({ tokens, depth }: Tokens.Heading): string {
    const inner = stripAnsi(this.parser.parseInline(tokens));
    const prefix = depth <= 2 ? '\n' : '\n';
    return `${prefix}${inner}\n`;
  },
  paragraph({ tokens }: Tokens.Paragraph): string {
    return `${stripAnsi(this.parser.parseInline(tokens))}\n\n`;
  },
  strong({ tokens }: Tokens.Strong): string {
    return stripAnsi(this.parser.parseInline(tokens));
  },
  em({ tokens }: Tokens.Em): string {
    return stripAnsi(this.parser.parseInline(tokens));
  },
  codespan({ text }: Tokens.Codespan): string {
    return text;
  },
  code({ text }: Tokens.Code): string {
    return `\n${text.replace(/\n$/, '')}\n\n`;
  },
  link({ href, tokens }: Tokens.Link): string {
    const inner = stripAnsi(this.parser.parseInline(tokens));
    const safe = stripUnsafeUrl(href);
    if (!safe) return inner;
    return `${inner} (${safe})`;
  },
  blockquote({ tokens }: Tokens.Blockquote): string {
    const inner = this.parser.parse(tokens);
    return inner
      .split('\n')
      .filter(Boolean)
      .map((line) => `│ ${stripAnsi(line)}`)
      .join('\n')
      .concat('\n\n');
  },
  list(token: Tokens.List): string {
    return token.items
      .map((item, index) => {
        const bullet = token.ordered ? `${index + 1}.` : '•';
        const body = stripAnsi(this.parser.parse(item.tokens)).trimEnd();
        return `${bullet} ${body}`;
      })
      .join('\n')
      .concat('\n\n');
  },
  table(token: Tokens.Table): string {
    const header = token.header.map((cell) =>
      decodeBasicHtmlEntities(stripAnsi(this.parser.parseInline(cell.tokens))),
    );
    const rows = token.rows.map((row) =>
      row.map((cell) =>
        decodeBasicHtmlEntities(stripAnsi(this.parser.parseInline(cell.tokens))),
      ),
    );
    return `\n${formatTerminalTable(header, rows, token.align, {
      maxWidth: resolveMarkdownTableWidth(),
    })}\n\n`;
  },
  hr(): string {
    return `${'─'.repeat(40)}\n\n`;
  },
};

const marked = new Marked({ renderer, gfm: true, breaks: true });

/** Render assistant markdown for the terminal. */
export function renderTerminalMarkdown(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return '';
  const htmlLike = trimmed.includes('<') && trimmed.includes('>');
  const input = htmlLike ? trimmed.replace(/<[^>]+>/g, '') : trimmed;
  const out = marked.parse(input) as string;
  const normalized = out.replace(/\n{3,}/g, '\n\n').trimEnd();
  return colorizeAssistantBody(normalized);
}

export function writeAssistantMarkdown(source: string): void {
  const rendered = renderTerminalMarkdown(source);
  if (!rendered) return;
  const label = terminalColorsEnabled() ? paint('1;38;5;183', 'Assistant') : 'Assistant';
  process.stdout.write(`\n${label}\n${rendered}\n`);
}
