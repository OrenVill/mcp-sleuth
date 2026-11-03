import { describe, expect, it } from 'vitest';
import { isKnownCommand, parseArgv } from './argv';

describe('parseArgv', () => {
  it('normalizes tui to chat', () => {
    const { command } = parseArgv(['tui']);
    expect(command).toBe('chat');
  });

  it('parses global flags', () => {
    const { command, rest, flags } = parseArgv([
      'readiness',
      '--server',
      'my-api',
      '--json',
      '-o',
      'out.md',
    ]);
    expect(command).toBe('readiness');
    expect(rest).toEqual([]);
    expect(flags.server).toBe('my-api');
    expect(flags.json).toBe(true);
    expect(flags.output).toBe('out.md');
  });

  it('keeps audit subcommand in rest', () => {
    const { command, rest } = parseArgv(['audit', 'permission']);
    expect(command).toBe('audit');
    expect(rest).toEqual(['permission']);
  });
});

describe('isKnownCommand', () => {
  it('includes chat and readiness', () => {
    expect(isKnownCommand('chat')).toBe(true);
    expect(isKnownCommand('readiness')).toBe(true);
    expect(isKnownCommand('nope')).toBe(false);
  });
});
