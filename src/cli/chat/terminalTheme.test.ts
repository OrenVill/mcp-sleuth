import { describe, expect, it } from 'vitest';
import { paint, terminalColorsEnabled } from './terminalTheme';

describe('paint', () => {
  it('does not emit a stray m when codes already end with m', () => {
    const prev = process.env.NO_COLOR;
    delete process.env.NO_COLOR;
    const styled = paint('38;5;240m', '│');
    if (prev === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prev;

    if (terminalColorsEnabled()) {
      expect(styled).not.toMatch(/mm/);
      expect(styled.endsWith('│\x1b[0m')).toBe(true);
    }
  });
});
