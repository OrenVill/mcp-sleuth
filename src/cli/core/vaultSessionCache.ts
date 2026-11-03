import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDataDir, writePrivateFile } from '../../../data-dir.js';
import { decryptUtf8, fromB64, importAesKeyRaw, exportAesKeyRaw } from '../../lib/vault/crypto';
import { parseVaultEnvelope } from '../../lib/vault/envelope';
import { parseVaultPayload } from '../../lib/vault/service';
import { vaultFilePath } from './vaultSession';

export const VAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_FILE = 'cli-vault-session.json';

type SessionFile = {
  version: 1;
  expiresAt: number;
  aesKeyB64: string;
};

let memorySession: { expiresAt: number; aesKey: CryptoKey } | null = null;

function sessionPath(): string {
  return join(getDataDir(), SESSION_FILE);
}

function usesScriptedPassphrase(flags: { passphraseFile?: string }): boolean {
  return Boolean(process.env.MCP_DETECTIVE_VAULT_PASSPHRASE || flags.passphraseFile);
}

function isValid(expiresAt: number, now = Date.now()): boolean {
  return expiresAt > now;
}

async function readSessionFile(): Promise<SessionFile | null> {
  try {
    const raw = await readFile(sessionPath(), 'utf8');
    const parsed = JSON.parse(raw) as SessionFile;
    if (parsed?.version !== 1 || typeof parsed.expiresAt !== 'number' || !parsed.aesKeyB64) {
      return null;
    }
    if (!isValid(parsed.expiresAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function persistSession(aesKey: CryptoKey, now = Date.now()): Promise<void> {
  const expiresAt = now + VAULT_SESSION_TTL_MS;
  const aesKeyB64 = await exportAesKeyRaw(aesKey);
  const payload: SessionFile = { version: 1, expiresAt, aesKeyB64 };
  await writePrivateFile(sessionPath(), JSON.stringify(payload));
  memorySession = { expiresAt, aesKey };
}

export async function clearVaultSession(): Promise<void> {
  memorySession = null;
  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(sessionPath());
  } catch {
    /* missing file */
  }
}

/** Test-only: simulate a new CLI process with the session file still on disk. */
export function resetVaultSessionMemoryForTests(): void {
  memorySession = null;
}

/** Slide the 30-minute window forward (new CLI command or chat turn). */
export async function touchVaultSession(): Promise<void> {
  if (memorySession && isValid(memorySession.expiresAt)) {
    await persistSession(memorySession.aesKey);
    return;
  }
  const file = await readSessionFile();
  if (!file) return;
  const aesKey = await importAesKeyRaw(file.aesKeyB64);
  await persistSession(aesKey);
}

export async function loadCachedAesKey(
  flags: { passphraseFile?: string },
): Promise<CryptoKey | null> {
  if (usesScriptedPassphrase(flags)) return null;

  if (memorySession && isValid(memorySession.expiresAt)) {
    return memorySession.aesKey;
  }

  const file = await readSessionFile();
  if (!file) return null;
  try {
    const aesKey = await importAesKeyRaw(file.aesKeyB64);
    memorySession = { expiresAt: file.expiresAt, aesKey };
    return aesKey;
  } catch {
    await clearVaultSession();
    return null;
  }
}

export async function rememberUnlockedVault(aesKey: CryptoKey): Promise<void> {
  await persistSession(aesKey);
}

export async function openVaultWithAesKey(aesKey: CryptoKey) {
  const raw = await readFile(vaultFilePath(), 'utf8');
  const envelope = parseVaultEnvelope(JSON.parse(raw) as unknown);
  if (!envelope) throw new Error('Vault file is invalid.');
  const ciphertext = new Uint8Array(fromB64(envelope.cipher.ciphertextB64));
  const plaintext = await decryptUtf8(aesKey, fromB64(envelope.cipher.ivB64), ciphertext);
  const payload = parseVaultPayload(plaintext);
  return { aesKey, servers: payload.servers, llmConfigs: payload.llmConfigs };
}
