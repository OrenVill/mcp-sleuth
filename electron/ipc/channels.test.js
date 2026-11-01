import { describe, expect, it } from 'vitest';
import { CHANNELS, fail, isTrustedSenderUrl, ok } from './channels.js';

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

describe('isTrustedSenderUrl', () => {
  const appOrigin = 'app://mcp-sleuth';

  it('accepts the packaged renderer', () => {
    expect(isTrustedSenderUrl('app://mcp-sleuth/index.html', { appOrigin })).toBe(true);
  });

  it('accepts the dev server when one is configured', () => {
    expect(
      isTrustedSenderUrl('http://localhost:5173/', { appOrigin, devUrl: 'http://localhost:5173' }),
    ).toBe(true);
  });

  it('refuses the dev server when none is configured', () => {
    expect(isTrustedSenderUrl('http://localhost:5173/', { appOrigin })).toBe(false);
  });

  it('refuses a frame showing content from an MCP server', () => {
    expect(isTrustedSenderUrl('https://evil.example/page', { appOrigin })).toBe(false);
    expect(isTrustedSenderUrl('about:srcdoc', { appOrigin })).toBe(false);
  });

  it('refuses a lookalike origin', () => {
    expect(isTrustedSenderUrl('app://mcp-sleuth.evil.example/', { appOrigin })).toBe(false);
  });

  it('refuses a missing url', () => {
    expect(isTrustedSenderUrl(undefined, { appOrigin })).toBe(false);
    expect(isTrustedSenderUrl('', { appOrigin })).toBe(false);
  });
});
