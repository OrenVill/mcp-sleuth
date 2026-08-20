import { browserHost } from './browser';
import type { Host } from './types';

export type { FilesHost, Host, McpHost } from './types';

let current: Host | null = null;

/**
 * The active host. Phase 2 replaces the fallback with detection of the
 * Electron preload bridge (`window.mcpExplorer`).
 */
export function getHost(): Host {
  return current ?? browserHost;
}

/** Install a host explicitly. Used by tests and, in Phase 2, by app bootstrap. */
export function setHost(host: Host): void {
  current = host;
}

/** Drop any explicitly installed host and fall back to the browser host. */
export function resetHost(): void {
  current = null;
}
