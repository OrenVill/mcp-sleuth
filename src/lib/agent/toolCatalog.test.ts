import { describe, expect, it } from 'vitest';
import type { ServerEntry } from '../../types';
import { buildToolCatalog, sanitizeToolName } from './toolCatalog';

const server = (id: string, name: string, tools: string[]): ServerEntry => ({
  id,
  name,
  url: `http://${id}`,
  status: 'connected',
  tools: tools.map((t) => ({
    name: t,
    description: `does ${t}`,
    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
  })),
});

describe('sanitizeToolName', () => {
  it('passes a legal name through', () => {
    expect(sanitizeToolName('list_repos')).toBe('list_repos');
  });

  it('replaces illegal characters', () => {
    expect(sanitizeToolName('list repos!')).toBe('list_repos_');
  });

  it('truncates to 64 characters', () => {
    expect(sanitizeToolName('a'.repeat(100))).toHaveLength(64);
  });
});

describe('buildToolCatalog', () => {
  it('includes only the selected servers', () => {
    const servers = [server('s1', 'One', ['alpha']), server('s2', 'Two', ['beta'])];
    const catalog = buildToolCatalog(servers, ['s1']);
    expect(catalog.tools.map((t) => t.name)).toEqual(['alpha']);
  });

  it('resolves a tool name back to its server', () => {
    const catalog = buildToolCatalog([server('s1', 'One', ['alpha'])], ['s1']);
    expect(catalog.resolve('alpha')).toEqual({ serverId: 's1', toolName: 'alpha' });
  });

  it('returns null for an unknown name', () => {
    const catalog = buildToolCatalog([server('s1', 'One', ['alpha'])], ['s1']);
    expect(catalog.resolve('nope')).toBeNull();
  });

  it('exposes the first server on a name collision and records the loser', () => {
    const servers = [server('s1', 'One', ['search']), server('s2', 'Two', ['search'])];
    const catalog = buildToolCatalog(servers, ['s1', 's2']);
    expect(catalog.tools).toHaveLength(1);
    expect(catalog.resolve('search')).toEqual({ serverId: 's1', toolName: 'search' });
    expect(catalog.collisions).toEqual([
      { llmName: 'search', keptServerId: 's1', droppedServerId: 's2', droppedServerName: 'Two' },
    ]);
  });

  it('skips servers that are not connected', () => {
    const disconnected = { ...server('s1', 'One', ['alpha']), status: 'disconnected' as const };
    expect(buildToolCatalog([disconnected], ['s1']).tools).toHaveLength(0);
  });

  it('carries an empty description through rather than inventing one', () => {
    const s = server('s1', 'One', ['alpha']);
    s.tools![0].description = undefined;
    expect(buildToolCatalog([s], ['s1']).tools[0].description).toBe('');
  });
});
