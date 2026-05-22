import type { ToolResult } from '../types';

export interface CallRecord {
  id: string;
  timestamp: number;
  serverId: string;
  serverName: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: ToolResult;
  durationMs?: number;
  isDiscovered?: boolean;
}

const STORAGE_KEY = 'mcp-explorer:call-history';
const MAX_RECORDS = 50;

export function loadHistory(): CallRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CallRecord[];
  } catch {
    return [];
  }
}

export function appendRecord(record: CallRecord): void {
  try {
    const existing = loadHistory();
    const updated = [record, ...existing].slice(0, MAX_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    /* ignore storage errors */
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
