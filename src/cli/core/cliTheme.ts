/** One-time CLI setup: purple-forward palette (Clack keeps its own accent colors). */
import { initTerminalTheme } from '../chat/terminalTheme';

let applied = false;

export function initCliTheme(): void {
  if (applied) return;
  applied = true;
  initTerminalTheme();
}
