import { describe, expect, it } from 'vitest';
import { CHANNELS, fail, ok } from './channels.js';

describe('CHANNELS', () => {
  it('namespaces every channel under mcp:', () => {
    for (const name of Object.values(CHANNELS)) {
      expect(name.startsWith('mcp:')).toBe(true);
    }
  });

  it('has no duplicate channel names', () => {
    const names = Object.values(CHANNELS);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('ok / fail', () => {
  it('wraps a success value', () => {
    expect(ok({ tools: [] })).toEqual({ ok: true, value: { tools: [] } });
  });

  it('wraps undefined', () => {
    expect(ok(undefined)).toEqual({ ok: true, value: undefined });
  });

  it('preserves the original message verbatim', () => {
    expect(fail(new Error('Not connected to server "srv-1"'))).toEqual({
      ok: false,
      error: { code: 'E_UNKNOWN', message: 'Not connected to server "srv-1"' },
    });
  });

  it('carries an explicit code', () => {
    expect(fail(new Error('boom'), 'E_CONNECT').error.code).toBe('E_CONNECT');
  });

  it('handles non-Error throwables', () => {
    expect(fail('plain string').error.message).toBe('plain string');
  });
});
