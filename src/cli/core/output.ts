import { writeFile } from 'node:fs/promises';
import type { GlobalCliFlags } from '../contracts';

export async function emitOutput(text: string, flags: GlobalCliFlags): Promise<void> {
  if (flags.output) {
    await writeFile(flags.output, text, 'utf8');
    return;
  }
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

export async function emitJson(value: unknown, flags: GlobalCliFlags): Promise<void> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (flags.output) {
    await writeFile(flags.output, text, 'utf8');
    return;
  }
  process.stdout.write(text);
}
