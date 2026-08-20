import { getHost } from '../host';
import { clearLegacyServers, loadLegacyServers, type StoredServer } from '../storage';
import {
  buildCipherBlob,
  buildKdfParams,
  createNewVaultKey,
  decryptUtf8,
  encryptUtf8,
  envelopeFromParts,
  fromB64,
  unlockKeyFromEnvelope,
} from './crypto';
import { deleteVaultRecord, getVaultEnvelope, putVaultEnvelope } from './vaultPersistence';
import type { VaultEnvelope } from './types';

export type VaultBootstrap =
  | { phase: 'ready'; aesKey: CryptoKey; servers: StoredServer[] }
  | { phase: 'needs-setup' }
  | { phase: 'needs-unlock' };

function parseStoredServers(jsonText: string): StoredServer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Vault data is unreadable. Please reset the vault.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Vault data is invalid. Please reset the vault.');
  }
  return parsed as StoredServer[];
}

function requireEnvelope(envelope: VaultEnvelope | null): VaultEnvelope {
  if (!envelope) {
    throw new Error('Vault is not set up yet.');
  }
  return envelope;
}

/**
 * Decide how the app should start.
 *
 * On a platform with a secure store the desktop app never prompts: a generated
 * device passphrase creates or unlocks the vault. Everywhere else this reduces to
 * the existing needs-setup / needs-unlock split.
 */
export async function bootstrapVault(): Promise<VaultBootstrap> {
  const envelope = await getVaultEnvelope();
  const autoPassphrase = await getHost().secrets.getAutoUnlockPassphrase();

  if (!autoPassphrase) {
    return envelope ? { phase: 'needs-unlock' } : { phase: 'needs-setup' };
  }

  if (envelope) {
    try {
      const { aesKey, servers } = await unlockVault(autoPassphrase);
      return { phase: 'ready', aesKey, servers };
    } catch {
      // A vault created before the secure store existed, or with a user-chosen
      // passphrase. Fall back to prompting rather than destroying it.
      return { phase: 'needs-unlock' };
    }
  }

  const legacyServers = loadLegacyServers() ?? [];
  const aesKey = await createVault(autoPassphrase, legacyServers);
  return { phase: 'ready', aesKey, servers: legacyServers };
}

export async function createVault(
  passphrase: string,
  servers: StoredServer[],
): Promise<CryptoKey> {
  const { aesKey, salt, iterations } = await createNewVaultKey(passphrase);
  const payload = JSON.stringify(servers);
  const { iv, ciphertext } = await encryptUtf8(payload, aesKey);
  const envelope = envelopeFromParts(
    buildKdfParams(salt, iterations),
    buildCipherBlob(iv, ciphertext),
  );
  await putVaultEnvelope(envelope);
  clearLegacyServers();
  return aesKey;
}

export async function unlockVault(
  passphrase: string,
): Promise<{ aesKey: CryptoKey; servers: StoredServer[] }> {
  const envelope = requireEnvelope(await getVaultEnvelope());
  const aesKey = await unlockKeyFromEnvelope(passphrase, envelope);
  try {
    const ciphertext = new Uint8Array(fromB64(envelope.cipher.ciphertextB64));
    const plaintext = await decryptUtf8(
      aesKey,
      fromB64(envelope.cipher.ivB64),
      ciphertext,
    );
    return { aesKey, servers: parseStoredServers(plaintext) };
  } catch {
    throw new Error('Could not unlock vault. Check your passphrase or reset the vault.');
  }
}

export async function saveVault(
  aesKey: CryptoKey,
  servers: StoredServer[],
): Promise<void> {
  const envelope = requireEnvelope(await getVaultEnvelope());
  const payload = JSON.stringify(servers);
  const { iv, ciphertext } = await encryptUtf8(payload, aesKey);
  await putVaultEnvelope({
    ...envelope,
    cipher: buildCipherBlob(iv, ciphertext),
    updatedAt: new Date().toISOString(),
  });
}

export async function resetVault(): Promise<void> {
  await deleteVaultRecord();
  clearLegacyServers();
}
