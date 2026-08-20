import type { SecretsHost, VaultEnvelopeBlob } from '../types';
import { type ElectronBridge, unwrapEnvelope } from './mcpElectron';

/**
 * Credential storage over the preload bridge. Main writes the same
 * `~/.mcp-explorer/vault.json` the CLI uses and seals the auto-unlock passphrase
 * with Electron's `safeStorage`.
 */
export function createElectronSecretsHost(bridge: ElectronBridge): SecretsHost {
  return {
    async loadEnvelope() {
      return unwrapEnvelope<VaultEnvelopeBlob | null>(await bridge.invoke('mcp:loadEnvelope'));
    },
    async saveEnvelope(envelope) {
      unwrapEnvelope<void>(await bridge.invoke('mcp:saveEnvelope', envelope));
    },
    async deleteEnvelope() {
      unwrapEnvelope<void>(await bridge.invoke('mcp:deleteEnvelope'));
    },
    async getAutoUnlockPassphrase() {
      return unwrapEnvelope<string | null>(await bridge.invoke('mcp:autoUnlockPassphrase'));
    },
  };
}
