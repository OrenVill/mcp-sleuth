import { getAppData, patchAppData } from './appData';

function makeKey(serverId: string, toolName: string): string {
  return `${serverId}::${toolName}`;
}

export function loadBookmarks(): Set<string> {
  return new Set(getAppData().bookmarks);
}

export function toggleBookmark(serverId: string, toolName: string): boolean {
  const key = makeKey(serverId, toolName);
  const current = new Set(getAppData().bookmarks);
  if (current.has(key)) {
    current.delete(key);
    patchAppData({ bookmarks: Array.from(current) });
    return false;
  }
  current.add(key);
  patchAppData({ bookmarks: Array.from(current) });
  return true;
}

export function isBookmarked(serverId: string, toolName: string): boolean {
  return getAppData().bookmarks.includes(makeKey(serverId, toolName));
}
