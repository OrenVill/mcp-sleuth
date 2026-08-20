import type { FilesHost } from '../types';
import { type ElectronBridge, unwrapEnvelope } from './mcpElectron';

/** File output and app-data persistence over the preload bridge. */
export function createElectronFilesHost(bridge: ElectronBridge): FilesHost {
  return {
    // FilesHost.saveFile is synchronous by contract; the dialog is fire-and-forget.
    saveFile(filename, content, mimeType) {
      void bridge
        .invoke('mcp:saveFile', filename, content, mimeType)
        .then((envelope) => unwrapEnvelope<string | null>(envelope))
        .catch((err: unknown) => {
          console.error('mcp-explorer: save failed', err);
        });
    },
    async readAppData() {
      return unwrapEnvelope<unknown | null>(await bridge.invoke('mcp:readAppData'));
    },
    async writeAppData(data) {
      unwrapEnvelope<void>(await bridge.invoke('mcp:writeAppData', data));
    },
  };
}
