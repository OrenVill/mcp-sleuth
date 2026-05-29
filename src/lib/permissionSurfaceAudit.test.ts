import { describe, expect, test } from 'vitest';
import { auditPermissionSurface, categoryLabel } from './permissionSurfaceAudit';
import type { ServerEntry, ToolDef } from '../types';

function serverWithTools(tools: ToolDef[]): ServerEntry {
  return {
    id: 'srv-1',
    name: 'Test Server',
    url: 'http://localhost:3000/mcp',
    status: 'connected',
    tools,
  };
}

describe('permissionSurfaceAudit', () => {
  test('detects filesystem signals from tool and parameter names', () => {
    const report = auditPermissionSurface([
      serverWithTools([
        {
          name: 'read_file',
          description: 'Read a file from disk',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Absolute file path' },
            },
          },
        },
      ]),
    ]);

    expect(report.servers).toHaveLength(1);
    const profile = report.servers[0].tools[0];
    expect(profile.categories).toContain('filesystem');
    expect(profile.signals.some((s) => s.category === 'filesystem')).toBe(true);
  });

  test('detects network and shell execution surfaces', () => {
    const report = auditPermissionSurface([
      serverWithTools([
        {
          name: 'fetch_url',
          description: 'HTTP GET request to remote endpoint',
          inputSchema: {
            type: 'object',
            properties: { url: { type: 'string' } },
          },
        },
        {
          name: 'run_shell',
          description: 'Execute bash command on host',
          inputSchema: {
            type: 'object',
            properties: { command: { type: 'string' } },
          },
        },
      ]),
    ]);

    const tools = report.servers[0].tools;
    expect(tools.find((t) => t.toolName === 'fetch_url')?.categories).toContain('network');
    expect(tools.find((t) => t.toolName === 'run_shell')?.categories).toContain('shell');
  });

  test('aggregates category counts per server without pass/fail score', () => {
    const report = auditPermissionSurface([
      serverWithTools([
        {
          name: 'delete_record',
          description: 'Permanently remove a database row',
          inputSchema: { type: 'object', properties: {} },
        },
      ]),
    ]);

    expect(report.servers[0].categoryCounts.destructive).toBeGreaterThan(0);
    expect('score' in report).toBe(false);
    expect('verdict' in report.servers[0]).toBe(false);
  });

  test('returns empty servers list when nothing is connected', () => {
    const report = auditPermissionSurface([
      { id: 'x', name: 'Offline', url: 'http://x', status: 'disconnected', tools: [] },
    ]);
    expect(report.servers).toHaveLength(0);
  });

  test('categoryLabel returns human-readable names', () => {
    expect(categoryLabel('filesystem')).toMatch(/file/i);
    expect(categoryLabel('shell')).toMatch(/shell/i);
  });
});
