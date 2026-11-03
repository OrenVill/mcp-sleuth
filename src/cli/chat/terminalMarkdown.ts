import { Marked, type RendererObject, type Tokens } from 'marked';

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
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

/** Plain-text table layout for the terminal (testable without marked). */
export function formatTerminalTable(
  header: string[],
  rows: string[][],
  align: Array<'left' | 'center' | 'right' | null> = [],
): string {
  if (header.length === 0) return '';

  const colCount = header.length;
  const widths = Array.from({ length: colCount }, (_, col) => {
    let max = visibleLength(header[col] ?? '');
    for (const row of rows) {
      max = Math.max(max, visibleLength(row[col] ?? ''));
    }
    return Math.min(Math.max(max, 3), 36);
  });

  const hLine = (left: string, mid: string, right: string, fill: string) => {
    const midSeg = widths.map((w) => fill.repeat(w + 2)).join(mid);
    return `${left}${midSeg}${right}`;
  };

  const headerRow = header.map((h) => stripAnsi(h));
  const rowsPlain = rows.map((row) => row.map((cell) => stripAnsi(cell)));

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
    const header = token.header.map((cell) => stripAnsi(this.parser.parseInline(cell.tokens)));
    const rows = token.rows.map((row) =>
      row.map((cell) => stripAnsi(this.parser.parseInline(cell.tokens))),
    );
    return `\n${formatTerminalTable(header, rows, token.align)}\n\n`;
  },
  hr(): string {
    return `${'─'.repeat(40)}\n\n`;
  },
};

const marked = new Marked({ renderer, gfm: true, breaks: true });

/** Render assistant markdown for the terminal (plain text, no ANSI). */
export function renderTerminalMarkdown(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return '';
  const htmlLike = trimmed.includes('<') && trimmed.includes('>');
  const input = htmlLike ? trimmed.replace(/<[^>]+>/g, '') : trimmed;
  const out = marked.parse(input) as string;
  return out.replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function writeAssistantMarkdown(source: string): void {
  const rendered = renderTerminalMarkdown(source);
  if (!rendered) return;
  process.stdout.write(`\nAssistant\n${rendered}\n`);
}
