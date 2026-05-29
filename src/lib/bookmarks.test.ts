import { describe, it, expect, beforeEach } from 'vitest';
import { loadBookmarks, toggleBookmark, isBookmarked } from './bookmarks';
import { _seedCache, _resetCache } from './appData';

describe('bookmarks', () => {
  beforeEach(() => {
    _resetCache();
    _seedCache({ version: 1, bookmarks: [], history: [], observationJournals: {} });
  });

  it('loadBookmarks returns empty set when no bookmarks', () => {
    expect(loadBookmarks().size).toBe(0);
  });

  it('toggleBookmark adds a bookmark and returns true', () => {
    const result = toggleBookmark('srv', 'tool');
    expect(result).toBe(true);
    expect(isBookmarked('srv', 'tool')).toBe(true);
  });

  it('toggleBookmark removes an existing bookmark and returns false', () => {
    toggleBookmark('srv', 'tool');
    const result = toggleBookmark('srv', 'tool');
    expect(result).toBe(false);
    expect(isBookmarked('srv', 'tool')).toBe(false);
  });

  it('loadBookmarks reflects current state', () => {
    toggleBookmark('srv', 'tool1');
    toggleBookmark('srv', 'tool2');
    const set = loadBookmarks();
    expect(set.has('srv::tool1')).toBe(true);
    expect(set.has('srv::tool2')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('isBookmarked returns false for unknown tool', () => {
    expect(isBookmarked('srv', 'unknown')).toBe(false);
  });
});
