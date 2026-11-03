import { writeFile } from 'node:fs/promises';
import type { GlobalCliFlags } from '../contracts';
import { renderTerminalMarkdown } from '../chat/terminalMarkdown';
import { paint, sgr, terminalColorsEnabled } from '../chat/terminalTheme';

export async function emitOutput(text: string, flags: GlobalCliFlags): Promise<void> {
  if (flags.output) {
    await writeFile(flags.output, text, 'utf8');
    return;
  }
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

/** Write markdown to a file raw; render to the terminal when interactive. */
export async function emitMarkdown(markdown: string, flags: GlobalCliFlags): Promise<void> {
  if (flags.output) {
    await writeFile(flags.output, markdown, 'utf8');
    return;
  }
  const rendered = renderTerminalMarkdown(markdown, { accentHeadings: true });
  await emitOutput(rendered, flags);
}

/** Short status line with a subtle accent prefix on TTY. */
export async function emitMessage(message: string, flags: GlobalCliFlags): Promise<void> {
  if (flags.output) {
    await writeFile(flags.output, `${message}\n`, 'utf8');
    return;
  }
  const line = terminalColorsEnabled()
    ? `${paint(sgr.accent, '◆')} ${message}\n`
    : `${message}\n`;
  process.stdout.write(line);
}

export async function emitTabList(
  headers: string[],
  rows: string[][],
  flags: GlobalCliFlags,
): Promise<void> {
  const lines = [
    headers.join('\t'),
    ...rows.map((row) => row.join('\t')),
  ].join('\n');
  if (flags.output) {
    await writeFile(flags.output, `${lines}\n`, 'utf8');
    return;
  }
  if (terminalColorsEnabled()) {
    process.stdout.write(`${paint(sgr.muted, headers.join('\t'))}\n`);
    for (const row of rows) {
      process.stdout.write(`${row.join('\t')}\n`);
    }
    return;
  }
  process.stdout.write(`${lines}\n`);
}

export async function emitJson(value: unknown, flags: GlobalCliFlags): Promise<void> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (flags.output) {
    await writeFile(flags.output, text, 'utf8');
    return;
  }
  process.stdout.write(text);
}
