import type { AgentRunSummaries } from './agent/types';
import { getHost } from './host';
import type { CallRecord } from './history';
import type { ObservationJournalsStore } from './observationJournal';

export interface AppData {
  version: number;
  bookmarks: string[];
  history: CallRecord[];
  observationJournals: ObservationJournalsStore;
  /** Derived per-server agent-run signal. Transcripts are never stored here. */
  agentRuns: AgentRunSummaries;
}

const DEFAULT: AppData = {
  version: 2,
  bookmarks: [],
  history: [],
  observationJournals: {},
  agentRuns: {},
};
const LS_BOOKMARKS = 'mcp-detective:bookmarks';
const LS_HISTORY = 'mcp-detective:call-history';
const LS_APP_DATA = 'mcp-detective:app-data';
// Written under older product names; read so a rename does not drop anyone's
// bookmarks or history. Writes only ever use the keys above.
const PRE_RENAME_KEYS = {
  bookmarks: ['mcp-sleuth:bookmarks', 'mcp-explorer:bookmarks'],
  history: ['mcp-sleuth:call-history', 'mcp-explorer:call-history'],
  appData: ['mcp-sleuth:app-data', 'mcp-explorer:app-data'],
} as const;

function readKey(current: string, preRename: readonly string[]): string | null {
  try {
    const direct = localStorage.getItem(current);
    if (direct !== null) return direct;
    for (const key of preRename) {
      const legacy = localStorage.getItem(key);
      if (legacy !== null) return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

let cache: AppData = { ...DEFAULT };
let initialized = false;

function parseAppData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT };
  const obj = raw as Record<string, unknown>;
  return {
    version: typeof obj.version === 'number' ? obj.version : 2,
    bookmarks: Array.isArray(obj.bookmarks)
      ? (obj.bookmarks as unknown[]).filter((b): b is string => typeof b === 'string')
      : [],
    history: Array.isArray(obj.history) ? (obj.history as CallRecord[]) : [],
    observationJournals:
      obj.observationJournals && typeof obj.observationJournals === 'object' && !Array.isArray(obj.observationJournals)
        ? (obj.observationJournals as ObservationJournalsStore)
        : {},
    agentRuns:
      obj.agentRuns && typeof obj.agentRuns === 'object' && !Array.isArray(obj.agentRuns)
        ? (obj.agentRuns as AgentRunSummaries)
        : {},
  };
}

function loadFromLocalStorage(): AppData {
  try {
    // Try the unified key first (post-migration), then fall back to the legacy split keys
    const unified = readKey(LS_APP_DATA, PRE_RENAME_KEYS.appData);
    if (unified) return parseAppData(JSON.parse(unified) as unknown);

    const rawBookmarks = readKey(LS_BOOKMARKS, PRE_RENAME_KEYS.bookmarks);
    const rawHistory = readKey(LS_HISTORY, PRE_RENAME_KEYS.history);
    return {
      version: 1,
      bookmarks: rawBookmarks
        ? ((JSON.parse(rawBookmarks) as unknown[]).filter((b): b is string => typeof b === 'string'))
        : [],
      history: rawHistory ? (JSON.parse(rawHistory) as CallRecord[]) : [],
      observationJournals: {},
      agentRuns: {},
    };
  } catch {
    return { ...DEFAULT };
  }
}

function hasLegacyLocalStorage(): boolean {
  try {
    return (
      readKey(LS_BOOKMARKS, PRE_RENAME_KEYS.bookmarks) !== null ||
      readKey(LS_HISTORY, PRE_RENAME_KEYS.history) !== null
    );
  } catch {
    return false;
  }
}

function clearLegacyLocalStorage(): void {
  try {
    localStorage.removeItem(LS_BOOKMARKS);
    localStorage.removeItem(LS_HISTORY);
    for (const key of PRE_RENAME_KEYS.bookmarks) localStorage.removeItem(key);
    for (const key of PRE_RENAME_KEYS.history) localStorage.removeItem(key);
  } catch { /* ignore */ }
}

async function persistToFile(data: AppData): Promise<void> {
  await getHost().files.writeAppData(data);
}

function persistToLocalStorage(data: AppData): void {
  try {
    localStorage.setItem(LS_APP_DATA, JSON.stringify(data));
  } catch { /* ignore */ }
}

async function persistAppData(): Promise<void> {
  try {
    await persistToFile(cache);
  } catch {
    // No host-backed store (static build opened from file://, or the server is
    // gone) — localStorage keeps the app working.
    persistToLocalStorage(cache);
  }
}

export async function initAppData(): Promise<void> {
  if (initialized) return;

  try {
    const raw = await getHost().files.readAppData();

    if (raw !== null) {
      cache = parseAppData(raw);
      initialized = true;
      return;
    }

    // null means "nothing stored yet" — the same signal the old 404 branch used.
    // Migrate any legacy localStorage data into the store on first run.
    const migrated = loadFromLocalStorage();
    cache = migrated;
    initialized = true;
    if (hasLegacyLocalStorage()) {
      let persistedOk = false;
      try {
        await persistToFile(cache);
        persistedOk = true;
      } catch { /* keep legacy keys as fallback */ }
      if (persistedOk) clearLegacyLocalStorage();
    }
    return;
  } catch { /* fall through to localStorage */ }

  cache = loadFromLocalStorage();
  initialized = true;
}

export function getAppData(): AppData {
  return cache;
}

export function patchAppData(patch: Partial<AppData>): void {
  cache = { ...cache, ...patch };
  void persistAppData();
}

/** For tests only — seed cache without fetching. */
export function _seedCache(data: AppData): void {
  cache = { ...data };
  initialized = true;
}

/** For tests only — reset cache to uninitialized state. */
export function _resetCache(): void {
  cache = { ...DEFAULT };
  initialized = false;
}
