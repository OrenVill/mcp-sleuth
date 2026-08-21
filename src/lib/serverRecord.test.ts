import { describe, expect, it } from 'vitest';
import { fromStoredServers, makeId, toStoredServers } from './serverRecord';
import type { ServerEntry } from '../types';

describe('fromStoredServers', () => {
  it('never restores a connection', () => {
    // Status is runtime state; a restored server must start disconnected or the
    // UI claims live sessions that do not exist.
    const [entry] = fromStoredServers([{ id: 'a', name: 'A', url: 'https://x/mcp' }] as never);
    expect(entry.status).toBe('disconnected');
  });

  it('defaults proxying on and transport to http', () => {
    const [entry] = fromStoredServers([{ id: 'a', name: 'A' }] as never);
    expect(entry.proxyThroughLocal).toBe(true);
    expect(entry.transport).toBe('http');
    expect(entry.url).toBe('');
  });

  it('preserves an explicit proxy-off setting', () => {
    const [entry] = fromStoredServers([
      { id: 'a', name: 'A', proxyThroughLocal: false },
    ] as never);
    expect(entry.proxyThroughLocal).toBe(false);
  });
});

describe('toStoredServers', () => {
  it('drops runtime state', () => {
    const entry = {
      id: 'a', name: 'A', url: 'https://x/mcp', custom: true,
      proxyThroughLocal: true, transport: 'http', status: 'connected',
      tools: [{ name: 'echo' }],
    } as unknown as ServerEntry;

    const [stored] = toStoredServers([entry]);
    expect('status' in stored).toBe(false);
    expect('tools' in stored).toBe(false);
  });

  it('round-trips through the vault without losing configuration', () => {
    const original = fromStoredServers([
      {
        id: 'a', name: 'A', url: 'https://x/mcp', transport: 'stdio',
        stdio: { command: 'node', args: ['s.mjs'] }, proxyThroughLocal: false,
      },
    ] as never);

    const back = fromStoredServers(toStoredServers(original));
    expect(back[0]).toEqual(original[0]);
  });
});

describe('makeId', () => {
  it('slugifies the name', () => {
    expect(makeId('My Server!', new Set())).toBe('my-server');
  });

  it('falls back when the name has nothing usable', () => {
    expect(makeId('!!!', new Set())).toBe('server');
  });

  it('suffixes to avoid a collision', () => {
    expect(makeId('A', new Set(['a']))).toBe('a-2');
    expect(makeId('A', new Set(['a', 'a-2', 'a-3']))).toBe('a-4');
  });
});
