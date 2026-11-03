import type { FilesHost, SaveFileResult } from '../types';
import { type ElectronBridge, unwrapEnvelope } from './mcpElectron';

/** File output and app-data persistence over the preload bridge. */
export function createElectronFilesHost(bridge: ElectronBridge): FilesHost {
  async function saveFileAsync(
    filename: string,
    content: string,
    mimeType: string,
  ): Promise<SaveFileResult> {
    try {
      const path = unwrapEnvelope<string | null>(
        await bridge.invoke('mcp:saveFile', filename, content, mimeType),
      );
      if (path === null) return 'cancelled';
      return 'saved';
    } catch (err: unknown) {
      console.error('mcp-detective: save failed', err);
      return 'failed';
    }
  }

  return {
    saveFile(filename, content, mimeType) {
      void saveFileAsync(filename, content, mimeType);
    },
    saveFileAsync,
    async readAppData() {
      return unwrapEnvelope<unknown | null>(await bridge.invoke('mcp:readAppData'));
    },
    async writeAppData(data) {
      unwrapEnvelope<void>(await bridge.invoke('mcp:writeAppData', data));
    },
  };
}
