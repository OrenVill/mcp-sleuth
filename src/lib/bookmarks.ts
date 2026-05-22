const STORAGE_KEY = 'mcp-explorer:bookmarks';

function makeKey(serverId: string, toolName: string): string {
  return `${serverId}::${toolName}`;
}

export function loadBookmarks(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set<string>(parsed as string[]);
    return new Set();
  } catch {
    return new Set();
  }
}

function saveBookmarks(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Silently ignore storage errors (e.g. private browsing quota)
  }
}

/** Toggles the bookmark for the given serverId + toolName. Returns the new bookmarked state. */
export function toggleBookmark(serverId: string, toolName: string): boolean {
  const key = makeKey(serverId, toolName);
  const set = loadBookmarks();
  if (set.has(key)) {
    set.delete(key);
    saveBookmarks(set);
    return false;
  } else {
    set.add(key);
    saveBookmarks(set);
    return true;
  }
}

export function isBookmarked(serverId: string, toolName: string): boolean {
  return loadBookmarks().has(makeKey(serverId, toolName));
}
