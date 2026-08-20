import type { Host } from '../types';
import { browserFilesHost } from '../browser/filesBrowser';
import { createElectronMcpHost, type ElectronBridge } from './mcpElectron';

export function createElectronHost(bridge: ElectronBridge): Host {
  return {
    kind: 'electron',
    mcp: createElectronMcpHost(bridge),
    // Phase 2b replaces this with dialog.showSaveDialog over IPC. A blob download
    // in an Electron renderer still triggers Electron's own save dialog.
    files: browserFilesHost,
  };
}
