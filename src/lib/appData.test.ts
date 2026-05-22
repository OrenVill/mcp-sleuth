import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initAppData,
  getAppData,
  patchAppData,
  _seedCache,
  _resetCache,
} from './appData';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

// window is undefined in node env → prefersFileApi() returns false → uses localStorage fallback
describe('appData (localStorage fallback path)', () => {
  beforeEach(() => {
    localStorageMock.clear();
    _resetCache();
  });

  it('getAppData returns empty defaults before init', () => {
    const d = getAppData();
    expect(d.bookmarks).toEqual([]);
    expect(d.history).toEqual([]);
  });

  it('initAppData loads from localStorage bookmark key', async () => {
    store['mcp-explorer:bookmarks'] = JSON.stringify(['s::t']);
    await initAppData();
    expect(getAppData().bookmarks).toEqual(['s::t']);
  });

  it('initAppData loads from localStorage history key', async () => {
    const rec = { id: 'r1', timestamp: 1, serverId: 's', serverName: 'S', toolName: 't', args: {} };
    store['mcp-explorer:call-history'] = JSON.stringify([rec]);
    await initAppData();
    expect(getAppData().history).toHaveLength(1);
    expect(getAppData().history[0].id).toBe('r1');
  });

  it('initAppData loads from unified localStorage key when present', async () => {
    store['mcp-explorer:app-data'] = JSON.stringify({
      version: 1,
      bookmarks: ['s::unified'],
      history: [],
    });
    await initAppData();
    expect(getAppData().bookmarks).toEqual(['s::unified']);
  });

  it('initAppData is idempotent — second call is a no-op', async () => {
    store['mcp-explorer:bookmarks'] = JSON.stringify(['s::t']);
    await initAppData();
    store['mcp-explorer:bookmarks'] = JSON.stringify(['s::other']);
    await initAppData(); // should not re-read
    expect(getAppData().bookmarks).toEqual(['s::t']);
  });

  it('patchAppData updates the cache', () => {
    _seedCache({ version: 1, bookmarks: [], history: [] });
    patchAppData({ bookmarks: ['a::b'] });
    expect(getAppData().bookmarks).toEqual(['a::b']);
  });

  it('patchAppData writes to localStorage when file API unavailable', async () => {
    _seedCache({ version: 1, bookmarks: [], history: [] });
    patchAppData({ bookmarks: ['a::b'] });
    // wait for the async background save to flush
    await new Promise((r) => setTimeout(r, 10));
    const saved = JSON.parse(store['mcp-explorer:app-data'] ?? 'null');
    expect(saved?.bookmarks).toEqual(['a::b']);
  });

  it('_seedCache sets cache and marks initialized', () => {
    _seedCache({ version: 1, bookmarks: ['x::y'], history: [] });
    expect(getAppData().bookmarks).toEqual(['x::y']);
  });
});
