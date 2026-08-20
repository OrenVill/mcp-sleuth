/**
 * Vault envelope persistence.
 *
 * The transport lives in the active host's `secrets` group — the browser host keeps
 * the file-API-with-IndexedDB-fallback behaviour, Electron writes the same
 * `~/.mcp-sleuth/vault.json` the CLI uses. Envelope parsing stays here so the
 * envelope shape never leaks into the host layer.
 */
import { getHost } from '../host';
import { parseVaultEnvelope } from './envelope';
import type { VaultEnvelope } from './types';

export async function getVaultEnvelope(): Promise<VaultEnvelope | null> {
  return parseVaultEnvelope(await getHost().secrets.loadEnvelope());
}

export async function putVaultEnvelope(envelope: VaultEnvelope): Promise<void> {
  await getHost().secrets.saveEnvelope(envelope);
}

export async function deleteVaultRecord(): Promise<void> {
  await getHost().secrets.deleteEnvelope();
}
