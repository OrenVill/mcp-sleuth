import type { ToolResult } from '../types';
import { getAppData, patchAppData } from './appData';

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

const MAX_RECORDS = 500;

export function loadHistory(): CallRecord[] {
  return getAppData().history;
}

export function appendRecord(record: CallRecord): void {
  const updated = [record, ...getAppData().history].slice(0, MAX_RECORDS);
  patchAppData({ history: updated });
}

export function clearHistory(): void {
  patchAppData({ history: [] });
}
