import { browserHost } from './browser';
import { createElectronHost } from './electron';
import type { ElectronBridge } from './electron/mcpElectron';
import type { Host } from './types';

export type { FilesHost, Host, McpHost } from './types';

let current: Host | null = null;
let detected: Host | null = null;

declare global {
  interface Window {
    mcpExplorer?: ElectronBridge;
  }
}

function detect(): Host {
  const bridge = typeof window !== 'undefined' ? window.mcpExplorer : undefined;
  if (bridge && bridge.kind === 'electron') return createElectronHost(bridge);
  return browserHost;
}

/** The active host: the Electron bridge when present, otherwise the browser host. */
export function getHost(): Host {
  if (current) return current;
  if (!detected) detected = detect();
  return detected;
}

/** Install a host explicitly. Used by tests. */
export function setHost(host: Host): void {
  current = host;
}

/** Drop any explicitly installed host and re-run detection on next access. */
export function resetHost(): void {
  current = null;
  detected = null;
}
