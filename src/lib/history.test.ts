import { describe, it, expect, beforeEach } from 'vitest';
import { appendRecord, loadHistory, clearHistory } from './history';
import { _seedCache, _resetCache } from './appData';
import type { CallRecord } from './history';

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
    _resetCache();
    _seedCache({ version: 1, bookmarks: [], history: [] });
  });

  it('loadHistory returns [] when empty', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('appendRecord stores a record and loadHistory returns it', () => {
    const r = makeRecord('r1');
    appendRecord(r);
    expect(loadHistory()).toHaveLength(1);
    expect(loadHistory()[0].id).toBe('r1');
  });

  it('most recent record appears first', () => {
    appendRecord(makeRecord('r1'));
    appendRecord(makeRecord('r2'));
    const history = loadHistory();
    expect(history[0].id).toBe('r2');
    expect(history[1].id).toBe('r1');
  });

  it('caps at 500 records, dropping oldest', () => {
    for (let i = 0; i < 505; i++) {
      appendRecord(makeRecord(`r${i}`));
    }
    const history = loadHistory();
    expect(history).toHaveLength(500);
    expect(history[0].id).toBe('r504');
  });

  it('clearHistory empties the store', () => {
    appendRecord(makeRecord('r1'));
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
});
