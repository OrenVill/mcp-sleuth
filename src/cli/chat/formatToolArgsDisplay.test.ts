import { describe, expect, it } from 'vitest';
import {
  formatToolArgsDisplayLines,
  normalizeToolArgsForDisplay,
  summarizeBatchToolArgs,
} from './formatToolArgsDisplay';

describe('normalizeToolArgsForDisplay', () => {
  it('parses JSON embedded in string fields', () => {
    const inner = [{ name: 'get_weather', arguments: { lat: 1 } }];
    const args = normalizeToolArgsForDisplay({
      tools_json: JSON.stringify(inner),
    });
    expect(args.tools_json).toEqual(inner);
  });
});

describe('summarizeBatchToolArgs', () => {
  it('counts nested tool calls', () => {
    expect(
      summarizeBatchToolArgs({
        tools_json: JSON.stringify([{ name: 'a' }, { name: 'b' }]),
      }),
    ).toBe('2 nested tool call(s)');
  });
});

describe('formatToolArgsDisplayLines', () => {
  it('wraps long lines', () => {
    const lines = formatToolArgsDisplayLines(
      { tools_json: JSON.stringify([{ name: 'x'.repeat(80) }]) },
      { innerWidth: 40, maxLines: 50 },
    );
    expect(lines[0]).toMatch(/nested tool call/);
    expect(lines.every((l) => l.length <= 40)).toBe(true);
  });
});
