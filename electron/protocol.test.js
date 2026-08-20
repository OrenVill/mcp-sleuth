import { describe, expect, it } from 'vitest';
import { resolveAppPath } from './protocol.js';

const ROOT = '/app/dist';

describe('resolveAppPath', () => {
  it('maps the root to index.html', () => {
    expect(resolveAppPath('app://mcp-sleuth/', ROOT)).toBe('/app/dist/index.html');
  });

  it('maps an asset path', () => {
    expect(resolveAppPath('app://mcp-sleuth/assets/main.js', ROOT)).toBe(
      '/app/dist/assets/main.js',
    );
  });

  it('ignores query strings and hashes', () => {
    expect(resolveAppPath('app://mcp-sleuth/assets/a.css?v=1#x', ROOT)).toBe(
      '/app/dist/assets/a.css',
    );
  });

  it('falls back to index.html for extensionless routes (SPA)', () => {
    expect(resolveAppPath('app://mcp-sleuth/settings', ROOT)).toBe('/app/dist/index.html');
  });

  it('rejects traversal outside the root', () => {
    expect(resolveAppPath('app://mcp-sleuth/../../etc/passwd', ROOT)).toBeNull();
  });

  it('rejects encoded traversal', () => {
    expect(resolveAppPath('app://mcp-sleuth/%2e%2e%2f%2e%2e%2fetc/passwd', ROOT)).toBeNull();
  });
});
