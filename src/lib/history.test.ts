import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appendRecord, loadHistory, clearHistory } from './history';
import type { CallRecord } from './history';

// localStorage mock for node test environment
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

function makeRecord(id: string, overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id,
    timestamp: Date.now(),
    serverId: 'server-1',
    serverName: 'My Server',
    toolName: 'my_tool',
    args: { foo: 'bar' },
    ...overrides,
  };
}

describe('history', () => {
  beforeEach(() => {
    localStorageMock.clear();
    clearHistory();
  });

  it('loadHistory returns [] when empty', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('appendRecord stores a record and loadHistory returns it', () => {
    const r = makeRecord('r1');
    appendRecord(r);
    const history = loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('r1');
  });

  it('most recent record appears first', () => {
    appendRecord(makeRecord('r1'));
    appendRecord(makeRecord('r2'));
    const history = loadHistory();
    expect(history[0].id).toBe('r2');
    expect(history[1].id).toBe('r1');
  });

  it('caps at 50 records, dropping oldest', () => {
    for (let i = 0; i < 55; i++) {
      appendRecord(makeRecord(`r${i}`));
    }
    const history = loadHistory();
    expect(history).toHaveLength(50);
    // Most recent is r54
    expect(history[0].id).toBe('r54');
  });

  it('clearHistory empties storage', () => {
    appendRecord(makeRecord('r1'));
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
});
