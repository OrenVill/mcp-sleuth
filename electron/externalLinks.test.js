import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl, isWsl } from './externalLinks.js';

describe('isSafeExternalUrl', () => {
  it('allows http and https', () => {
    expect(isSafeExternalUrl('https://github.com/OrenVill/mcp-sleuth')).toBe(true);
    expect(isSafeExternalUrl('http://localhost:3001/docs')).toBe(true);
  });

  it('refuses schemes an MCP server could weaponise', () => {
    // Link targets can come from an untrusted server's tool descriptions or
    // markdown, so anything the OS might hand to a registered handler is out.
    for (const url of [
      'file:///etc/passwd',
      'smb://server/share',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vscode://file/etc/passwd',
      'ms-msdt:/id',
    ]) {
      expect(isSafeExternalUrl(url), url).toBe(false);
    }
  });

  it('refuses malformed input', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
  });
});

describe('isWsl', () => {
  it('detects both WSL markers', () => {
    expect(isWsl({ WSL_DISTRO_NAME: 'Ubuntu' })).toBe(true);
    expect(isWsl({ WSL_INTEROP: '/run/WSL/1_interop' })).toBe(true);
  });

  it('is false on a plain Linux desktop', () => {
    expect(isWsl({})).toBe(false);
  });
});
