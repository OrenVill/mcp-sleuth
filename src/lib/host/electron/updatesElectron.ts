import type { UpdateHost, UpdateStatus } from '../types';
import { type ElectronBridge, unwrapEnvelope } from './mcpElectron';

/**
 * Update notification over the preload bridge.
 *
 * Every method returns the whole status rather than a partial result, so the
 * renderer never reassembles state from an action's return value — main is the
 * single source of truth for what the user should see.
 */
export function createElectronUpdateHost(bridge: ElectronBridge): UpdateHost {
  async function call(channel: string, ...args: unknown[]): Promise<UpdateStatus | null> {
    return unwrapEnvelope<UpdateStatus | null>(await bridge.invoke(channel, ...args));
  }

  return {
    getStatus: () => call('mcp:updateGetStatus'),
    check: () => call('mcp:updateCheck'),
    setAutoCheck: (enabled) => call('mcp:updateSetAutoCheck', enabled),
    skip: (version) => call('mcp:updateSkip', version),
    dismiss: (version) => call('mcp:updateDismiss', version),

    // The URL is never sent from here: main opens whatever the last check
    // returned, and refuses anything that is not http(s).
    async openRelease() {
      unwrapEnvelope<boolean>(await bridge.invoke('mcp:updateOpenRelease'));
    },

    onUpdateAvailable(handler) {
      // Optional on the bridge type so an older preload cannot crash the renderer.
      if (!bridge.onUpdateAvailable) return () => {};
      return bridge.onUpdateAvailable((status) => handler(status as UpdateStatus));
    },
  };
}
