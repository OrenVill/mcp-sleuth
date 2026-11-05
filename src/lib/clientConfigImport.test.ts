import { describe, expect, test } from 'vitest';
import {
  generateClaudeDesktopConfig,
  generateCursorConfig,
  generateVSCodeConfig,
} from './clientConfigExport';
import {
  mergeImportedServers,
  parseClientConfigJson,
  resolvePlaceholderString,
} from './clientConfigImport';
import type { StoredServer } from './storage';

describe('clientConfigImport', () => {
  describe('resolvePlaceholderString', () => {
    test('resolves ${env:VAR} from env map', () => {
      const r = resolvePlaceholderString('Bearer ${env:MY_TOKEN}', { MY_TOKEN: 'abc' });
      expect(r.value).toBe('Bearer abc');
      expect(r.unresolved).toEqual([]);
    });

    test('resolves ${input:VAR} like VS Code', () => {
      const r = resolvePlaceholderString('${input:FOO}', { FOO: 'bar' });
      expect(r.value).toBe('bar');
    });

    test('reports unresolved names', () => {
      const r = resolvePlaceholderString('${env:MISSING}', {});
      expect(r.value).toBe('${env:MISSING}');
      expect(r.unresolved).toEqual(['MISSING']);
    });
  });

  describe('parseClientConfigJson', () => {
    test('parses Cursor mcpServers HTTP entry', () => {
      const json = generateCursorConfig({
        name: 'My Docs Server',
        url: 'https://docs.example.com/mcp',
      });
      const { servers, format, errors } = parseClientConfigJson(json);
      expect(errors).toEqual([]);
      expect(format).toBe('cursor');
      expect(servers).toHaveLength(1);
      expect(servers[0]).toMatchObject({
        configKey: 'my-docs-server',
        name: 'My Docs Server',
        transport: 'http',
        url: 'https://docs.example.com/mcp',
      });
    });

    test('round-trips bearer auth via env placeholder', () => {
      const json = generateCursorConfig({
        name: 'My API',
        url: 'https://api.example.com/mcp',
        auth: { method: 'bearer', bearerToken: 'secret-token' },
      });
      const { servers } = parseClientConfigJson(json, {
        env: { MY_API_TOKEN: 'secret-token' },
      });
      expect(servers[0].auth).toEqual({
        method: 'bearer',
        bearerToken: 'secret-token',
      });
    });

    test('round-trips api_key auth', () => {
      const json = generateCursorConfig({
        name: 'Keyed',
        url: 'https://api.example.com/mcp',
        auth: {
          method: 'api_key',
          apiKeyHeader: 'X-API-Key',
          apiKeyValue: 'key-123',
        },
      });
      const { servers } = parseClientConfigJson(json, {
        env: { KEYED_API_KEY: 'key-123' },
      });
      expect(servers[0].auth).toEqual({
        method: 'api_key',
        apiKeyHeader: 'X-API-Key',
        apiKeyValue: 'key-123',
      });
    });

    test('round-trips basic auth credentials env var as base64', () => {
      const creds = btoa('admin:pass123');
      const json = generateCursorConfig({
        name: 'Basic Srv',
        url: 'https://api.example.com/mcp',
        auth: { method: 'basic', basicUsername: 'admin', basicPassword: 'pass123' },
      });
      const { servers } = parseClientConfigJson(json, {
        env: { BASIC_SRV_CREDENTIALS: creds },
      });
      expect(servers[0].auth).toEqual({
        method: 'basic',
        basicUsername: 'admin',
        basicPassword: 'pass123',
      });
    });

    test('parses Claude Desktop shape', () => {
      const json = generateClaudeDesktopConfig({
        name: 'Claude Srv',
        url: 'https://claude.example.com/mcp',
      });
      const { format, servers } = parseClientConfigJson(json);
      expect(format).toBe('claude');
      expect(servers[0].transport).toBe('http');
      expect(servers[0].url).toBe('https://claude.example.com/mcp');
    });

    test('parses VS Code servers key', () => {
      const json = generateVSCodeConfig({
        name: 'VS Srv',
        url: 'https://vscode.example.com/mcp',
      });
      const { format, servers } = parseClientConfigJson(json);
      expect(format).toBe('vscode');
      expect(servers[0].url).toBe('https://vscode.example.com/mcp');
    });

    test('parses stdio with env placeholders', () => {
      const json = generateCursorConfig({
        name: 'My FS',
        transport: 'stdio',
        stdio: { command: 'npx', args: ['-y', '@mcp/fs'], envKeys: ['API_KEY'] },
        stdioEnv: { API_KEY: 'secret' },
      });
      const { servers } = parseClientConfigJson(json, {
        env: { MY_FS_API_KEY: 'secret' },
      });
      expect(servers[0].transport).toBe('stdio');
      expect(servers[0].stdio).toMatchObject({
        command: 'npx',
        args: ['-y', '@mcp/fs'],
        envKeys: ['API_KEY'],
      });
      expect(servers[0].stdioEnv).toEqual({ API_KEY: 'secret' });
    });

    test('returns parse errors for invalid JSON', () => {
      const { servers, errors } = parseClientConfigJson('{not json');
      expect(servers).toEqual([]);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('returns error when no server block found', () => {
      const { servers, errors } = parseClientConfigJson('{"other":{}}');
      expect(servers).toEqual([]);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('mergeImportedServers', () => {
    const existing: StoredServer[] = [
      {
        id: 'my-docs-server',
        name: 'My Docs Server',
        url: 'https://old.example.com/mcp',
        transport: 'http',
      },
    ];

    test('replaces existing server with same config key id', () => {
      const imported = parseClientConfigJson(
        generateCursorConfig({ name: 'My Docs Server', url: 'https://new.example.com/mcp' }),
      ).servers;
      const { servers, added, updated, skipped } = mergeImportedServers(existing, imported);
      expect(added).toBe(0);
      expect(updated).toBe(1);
      expect(skipped).toBe(0);
      expect(servers).toHaveLength(1);
      expect(servers[0].url).toBe('https://new.example.com/mcp');
      expect(servers[0].id).toBe('my-docs-server');
    });

    test('adds new servers', () => {
      const imported = parseClientConfigJson(
        generateCursorConfig({ name: 'Other', url: 'https://other.example.com/mcp' }),
      ).servers;
      const { servers, added } = mergeImportedServers(existing, imported);
      expect(added).toBe(1);
      expect(servers).toHaveLength(2);
    });

    test('skips duplicates when mode is skip', () => {
      const imported = parseClientConfigJson(
        generateCursorConfig({ name: 'My Docs Server', url: 'https://new.example.com/mcp' }),
      ).servers;
      const { servers, skipped } = mergeImportedServers(existing, imported, { duplicate: 'skip' });
      expect(skipped).toBe(1);
      expect(servers[0].url).toBe('https://old.example.com/mcp');
    });
  });
});
