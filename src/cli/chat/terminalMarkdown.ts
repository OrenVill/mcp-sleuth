import { Marked, type RendererObject, type Tokens } from 'marked';
import { paint, t } from './terminalTheme';

function stripUnsafeUrl(href: string | null | undefined): string | null {
  const stripped = Array.from(href ?? '')
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join('');
  if (/^(?:https?:|mailto:|#)/i.test(stripped)) return stripped;
  return null;
}

const renderer: RendererObject = {
  html({ text }: Tokens.HTML | Tokens.Tag): string {
    return paint('38;5;245', text);
  },
  heading({ tokens, depth }: Tokens.Heading): string {
    const inner = this.parser.parseInline(tokens);
    const tone = depth === 1 ? '1;38;5;252m' : '1;38;5;245m';
    return `\n${paint(tone, inner)}\n`;
  },
  paragraph({ tokens }: Tokens.Paragraph): string {
    return `${this.parser.parseInline(tokens)}\n\n`;
  },
  strong({ tokens }: Tokens.Strong): string {
    return paint('1;38;5;252m', this.parser.parseInline(tokens));
  },
  em({ tokens }: Tokens.Em): string {
    return paint('38;5;252m', this.parser.parseInline(tokens));
  },
  codespan({ text }: Tokens.Codespan): string {
    return paint('48;5;235;38;5;183m', ` ${text} `);
  },
  code({ text }: Tokens.Code): string {
    const lines = text.replace(/\n$/, '').split('\n');
    const body = lines.map((line) => paint('38;5;245m', line)).join('\n');
    return `\n${paint('48;5;235m', body)}\n\n`;
  },
  link({ href, tokens }: Tokens.Link): string {
    const inner = this.parser.parseInline(tokens);
    const safe = stripUnsafeUrl(href);
    if (!safe) return inner;
    return paint('4;38;5;141m', `${inner} (${safe})`);
  },
  blockquote({ tokens }: Tokens.Blockquote): string {
    const inner = this.parser.parse(tokens);
    return inner
      .split('\n')
      .filter(Boolean)
      .map((line) => paint('38;5;240m', `│ ${line}`))
      .join('\n')
      .concat('\n\n');
  },
  list(token: Tokens.List): string {
    return token.items
      .map((item, index) => {
        const bullet = token.ordered ? `${index + 1}.` : '•';
        const body = this.parser.parse(item.tokens).trimEnd();
        return `${paint('38;5;141m', bullet)} ${body}`;
      })
      .join('\n')
      .concat('\n\n');
  },
  hr(): string {
    return `${paint('38;5;240m', '─'.repeat(40))}\n\n`;
  },
};

const marked = new Marked({ renderer, gfm: true, breaks: true });

/** Render assistant markdown for the terminal (untrusted model text). */
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
  process.stdout.write(`\n${paint('38;5;141m', 'Assistant')}\n${rendered}\n`);
}
