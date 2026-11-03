/** One-time CLI setup: purple-forward palette (Clack keeps its own accent colors). */
import { initTerminalTheme } from '../chat/terminalTheme';

let applied = false;

export function initCliTheme(): void {
  if (applied) return;
  applied = true;
  if (
    process.stdout.isTTY &&
    (process.env.NO_COLOR === undefined || process.env.NO_COLOR === '')
  ) {
    process.env.FORCE_COLOR = '1';
  }
  initTerminalTheme();
}
