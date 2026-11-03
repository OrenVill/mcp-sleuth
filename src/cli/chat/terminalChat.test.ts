import { describe, expect, it } from 'vitest';
import { isChatExitInput } from './terminalChat';

describe('isChatExitInput', () => {
  it('matches exit case-insensitively', () => {
    expect(isChatExitInput('exit')).toBe(true);
    expect(isChatExitInput('EXIT')).toBe(true);
    expect(isChatExitInput('  exit  ')).toBe(true);
  });

  it('does not match empty or other text', () => {
    expect(isChatExitInput('')).toBe(false);
    expect(isChatExitInput('   ')).toBe(false);
    expect(isChatExitInput('exit now')).toBe(false);
    expect(isChatExitInput('quit')).toBe(false);
  });
});
