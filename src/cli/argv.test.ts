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
  it('parses check flags', () => {
    const { command, flags } = parseArgv([
      'check',
      '--server',
      'api',
      '--min-readiness',
      '80',
      '--fail-on-injection',
      '--replay',
      'suite.json',
      '--json',
    ]);
    expect(command).toBe('check');
    expect(flags.server).toBe('api');
    expect(flags.minReadiness).toBe(80);
    expect(flags.failOnInjection).toBe(true);
    expect(flags.replay).toBe('suite.json');
    expect(flags.json).toBe(true);
  });
});

describe('isKnownCommand', () => {
  it('includes chat, check, and readiness', () => {
    expect(isKnownCommand('chat')).toBe(true);
    expect(isKnownCommand('check')).toBe(true);
    expect(isKnownCommand('readiness')).toBe(true);
    expect(isKnownCommand('nope')).toBe(false);
  });
});
