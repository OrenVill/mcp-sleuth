import { describe, expect, test } from 'vitest';
import {
  generateCursorConfig,
  generateClaudeDesktopConfig,
  generateVSCodeConfig,
  generateAllConfigs,
  type ClientConfigInput,
} from './clientConfigExport';

function server(overrides: Partial<ClientConfigInput> = {}): ClientConfigInput {
  return {
    name: 'My Docs Server',
    url: 'https://docs.example.com/mcp',
    ...overrides,
  };
}

describe('clientConfigExport', () => {
  describe('generateCursorConfig', () => {
    test('produces valid Cursor mcp.json shape for no-auth server', () => {
      const result = generateCursorConfig(server());
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('mcpServers');
      const servers = parsed.mcpServers as Record<string, unknown>;
      expect(Object.keys(servers)).toHaveLength(1);
      const entry = Object.values(servers)[0] as Record<string, unknown>;
      expect(entry.url).toBe('https://docs.example.com/mcp');
      expect(entry).not.toHaveProperty('headers');
    });

    test('slugifies server name to create the key', () => {
      const result = generateCursorConfig(server({ name: 'My Docs Server' }));
      const parsed = JSON.parse(result) as Record<string, unknown>;
      const servers = parsed.mcpServers as Record<string, unknown>;
      expect(Object.keys(servers)[0]).toBe('my-docs-server');
    });

    test('includes bearer placeholder header, not actual token', () => {
      const result = generateCursorConfig(
        server({ auth: { method: 'bearer', bearerToken: 'secret-token' } }),
      );
      const parsed = JSON.parse(result) as Record<string, unknown>;
      const servers = parsed.mcpServers as Record<string, unknown>;
      const entry = Object.values(servers)[0] as Record<string, unknown>;
      const headers = entry.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/\$\{env:/);
      expect(headers['Authorization']).not.toContain('secret-token');
    });

    test('includes api_key placeholder header, not actual key', () => {
      const result = generateCursorConfig(
        server({
          auth: {
            method: 'api_key',
            apiKeyHeader: 'X-API-Key',
            apiKeyValue: 'my-secret',
          },
        }),
      );
      const parsed = JSON.parse(result) as Record<string, unknown>;
      const servers = parsed.mcpServers as Record<string, unknown>;
      const entry = Object.values(servers)[0] as Record<string, unknown>;
      const headers = entry.headers as Record<string, string>;
      expect(headers['X-API-Key']).toMatch(/\$\{env:/);
      expect(headers['X-API-Key']).not.toContain('my-secret');
    });

    test('includes basic auth placeholder, not actual credentials', () => {
      const result = generateCursorConfig(
        server({
          auth: {
            method: 'basic',
            basicUsername: 'admin',
            basicPassword: 'pass123',
          },
        }),
      );
      const parsed = JSON.parse(result) as Record<string, unknown>;
      const servers = parsed.mcpServers as Record<string, unknown>;
      const entry = Object.values(servers)[0] as Record<string, unknown>;
      const headers = entry.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/\$\{env:/);
      expect(headers['Authorization']).not.toContain('admin');
      expect(headers['Authorization']).not.toContain('pass123');
    });

    test('does not export proxy URL when proxyThroughLocal is true', () => {
      const result = generateCursorConfig(
        server({ url: 'https://real.example.com/mcp', proxyThroughLocal: true }),
      );
      const parsed = JSON.parse(result) as Record<string, unknown>;
      const servers = parsed.mcpServers as Record<string, unknown>;
      const entry = Object.values(servers)[0] as Record<string, unknown>;
      expect(String(entry.url)).not.toContain('localhost');
      expect(entry.url).toBe('https://real.example.com/mcp');
    });
  });

  describe('generateClaudeDesktopConfig', () => {
    test('produces valid Claude Desktop config shape', () => {
      const result = generateClaudeDesktopConfig(server());
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('mcpServers');
      const servers = parsed.mcpServers as Record<string, unknown>;
      const entry = Object.values(servers)[0] as Record<string, unknown>;
      expect(entry).toHaveProperty('type', 'http');
      expect(entry.url).toBe('https://docs.example.com/mcp');
    });

    test('includes env placeholder for bearer auth', () => {
      const result = generateClaudeDesktopConfig(
        server({ name: 'My API', auth: { method: 'bearer', bearerToken: 'tok' } }),
      );
      const parsed = JSON.parse(result) as Record<string, unknown>;
      const servers = parsed.mcpServers as Record<string, unknown>;
      const entry = Object.values(servers)[0] as Record<string, unknown>;
      expect(entry).toHaveProperty('headers');
      const headers = entry.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/\$\{env:/);
      expect(headers['Authorization']).not.toContain('tok');
    });
  });

  describe('generateVSCodeConfig', () => {
    test('produces VS Code mcp.json shape', () => {
      const result = generateVSCodeConfig(server());
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed).toHaveProperty('servers');
      const servers = parsed.servers as Record<string, unknown>;
      const entry = Object.values(servers)[0] as Record<string, unknown>;
      expect(entry).toHaveProperty('type', 'http');
      expect(entry.url).toBe('https://docs.example.com/mcp');
    });

    test('includes env placeholder for api_key auth', () => {
      const result = generateVSCodeConfig(
        server({
          auth: { method: 'api_key', apiKeyHeader: 'X-API-Key', apiKeyValue: 'secret' },
        }),
      );
      const parsed = JSON.parse(result) as Record<string, unknown>;
      const servers = parsed.servers as Record<string, unknown>;
      const entry = Object.values(servers)[0] as Record<string, unknown>;
      const headers = entry.headers as Record<string, string>;
      expect(headers['X-API-Key']).toMatch(/\$\{input:/);
      expect(headers['X-API-Key']).not.toContain('secret');
    });
  });

  describe('generateAllConfigs', () => {
    test('returns configs for all supported clients', () => {
      const result = generateAllConfigs(server());
      expect(result).toHaveProperty('cursor');
      expect(result).toHaveProperty('claude');
      expect(result).toHaveProperty('vscode');
      expect(result.cursor).toContain('mcpServers');
      expect(result.claude).toContain('"type"');
      expect(result.vscode).toContain('servers');
    });
  });
});
