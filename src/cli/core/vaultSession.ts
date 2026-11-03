import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDataDir, writePrivateFile } from '../../../data-dir.js';
import {
  buildCipherBlob,
  decryptUtf8,
  encryptUtf8,
  fromB64,
  unlockKeyFromEnvelope,
} from '../../lib/vault/crypto';
import { parseVaultEnvelope } from '../../lib/vault/envelope';
import {
  parseVaultPayload,
  serializeVaultPayload,
  type VaultPayload,
} from '../../lib/vault/service';
import type { StoredServer } from '../../lib/storage';
import type { VaultContext } from '../contracts';

let warnedShared = false;

export function warnIfSharedDataDir(): void {
  if (warnedShared) return;
  warnedShared = true;
  process.stderr.write(
    'mcp-detective: warning — CLI and desktop app share ~/.mcp-detective/; concurrent writes are last-write-wins.\n',
  );
}

export function vaultFilePath(): string {
  return join(getDataDir(), 'vault.json');
}

async function readEnvelopeFromDisk() {
  const raw = await readFile(vaultFilePath(), 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const envelope = parseVaultEnvelope(parsed);
  if (!envelope) {
    throw new Error('Vault file is invalid. Open MCP Detective in the browser to repair or reset.');
  }
  return envelope;
}

export async function unlockVaultFromDisk(passphrase: string): Promise<VaultContext> {
  let envelope;
  try {
    envelope = await readEnvelopeFromDisk();
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      throw new Error('Vault is not set up yet. Create one in MCP Detective first.', {
        cause: err,
      });
    }
    throw err;
  }

  const aesKey = await unlockKeyFromEnvelope(passphrase, envelope);
  try {
    const ciphertext = new Uint8Array(fromB64(envelope.cipher.ciphertextB64));
    const plaintext = await decryptUtf8(aesKey, fromB64(envelope.cipher.ivB64), ciphertext);
    const payload = parseVaultPayload(plaintext);
    return { aesKey, servers: payload.servers, llmConfigs: payload.llmConfigs };
  } catch {
    throw new Error('Could not unlock vault. Check your passphrase.');
  }
}

export async function writeVaultToDisk(ctx: VaultContext): Promise<void> {
  warnIfSharedDataDir();
  const envelope = await readEnvelopeFromDisk();
  const payload: VaultPayload = {
    version: 2,
    servers: ctx.servers,
    llmConfigs: ctx.llmConfigs,
  };
  const { iv, ciphertext } = await encryptUtf8(serializeVaultPayload(payload), ctx.aesKey);
  const saved = {
    ...envelope,
    cipher: buildCipherBlob(iv, ciphertext),
    updatedAt: new Date().toISOString(),
  };
  await writePrivateFile(vaultFilePath(), JSON.stringify(saved, null, 2));
}

export function resolveServerByName(servers: StoredServer[], nameOrId: string): StoredServer {
  const exact = servers.find((s) => s.id === nameOrId || s.name === nameOrId);
  if (exact) return exact;
  const lower = nameOrId.toLowerCase();
  const fuzzy = servers.find((s) => s.name.toLowerCase() === lower);
  if (fuzzy) return fuzzy;
  throw new Error(
    `Unknown server "${nameOrId}". Known: ${servers.map((s) => s.name).join(', ') || '(none)'}`,
  );
}
