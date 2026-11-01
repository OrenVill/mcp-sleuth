import { describe, expect, it } from 'vitest';
import { isHttpsUrl } from './serverUrl';

describe('isHttpsUrl', () => {
  it('recognises a TLS endpoint', () => {
    expect(isHttpsUrl('https://box.local:8443/mcp')).toBe(true);
    expect(isHttpsUrl('  https://box.local/mcp  ')).toBe(true);
  });

  it('is false for plain HTTP, where there is no certificate to waive', () => {
    expect(isHttpsUrl('http://localhost:8000/mcp')).toBe(false);
  });

  it('is false rather than throwing for a URL still being typed', () => {
    expect(isHttpsUrl('')).toBe(false);
    expect(isHttpsUrl('http')).toBe(false);
    expect(isHttpsUrl('box.local/mcp')).toBe(false);
  });
});
