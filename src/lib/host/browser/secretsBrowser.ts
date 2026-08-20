/**
 * Browser credential storage.
 *
 * Primary: encrypted vault JSON on disk via the local dev/preview server
 * (`vault-file-handler.js`).
 * Fallback: IndexedDB (file://, or if the app is not served with the Node/Vite API).
 * One-time: if the file is missing (404) but IndexedDB has a vault, PUT it to the file
 * and clear IDB.
 *
 * The envelope is opaque here — it is returned raw and parsed by
 * `src/lib/vault/vaultPersistence.ts`. `isVaultEnvelope` is used only as a validity
 * predicate, so garbage on either side is never migrated or allowed to shadow a real
 * vault.
 */
import { VAULT_HTTP_PATH } from '../../vault/constants';
import { isVaultEnvelope } from '../../vault/envelope';
import * as idb from '../../vault/idb';
import type { VaultEnvelope } from '../../vault/types';
import type { SecretsHost, VaultEnvelopeBlob } from '../types';

function prefersVaultFileApi(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol !== 'file:';
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** When the server has no file yet, move an existing IDB vault to disk. */
async function migrateIdbToFileIfPresent(
  idbEnv: VaultEnvelopeBlob | null,
): Promise<VaultEnvelopeBlob | null> {
  if (!idbEnv) return null;
  try {
    const res = await fetch(VAULT_HTTP_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(idbEnv),
    });
    if (res.ok) await idb.deleteVaultRecord().catch(() => {});
  } catch {
    /* keep IDB as source of truth */
  }
  return idbEnv;
}

async function loadEnvelope(): Promise<VaultEnvelopeBlob | null> {
  if (!prefersVaultFileApi()) {
    const raw: unknown = await idb.getVaultEnvelope();
    return isVaultEnvelope(raw) ? raw : null;
  }

  const [idbRaw, res] = await Promise.all([
    idb.getVaultEnvelope(),
    fetch(VAULT_HTTP_PATH, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }).catch(() => null),
  ]);

  const idbEnv: VaultEnvelopeBlob | null = isVaultEnvelope(idbRaw) ? idbRaw : null;

  if (!res) {
    return idbEnv;
  }

  const ct = res.headers.get('content-type') ?? '';
  let text: string;
  try {
    text = await res.text();
  } catch {
    return idbEnv;
  }

  const parsedJson =
    res.ok && ct.includes('application/json') && text.trim()
      ? safeJsonParse(text)
      : null;
  const httpEnv: VaultEnvelopeBlob | null = isVaultEnvelope(parsedJson) ? parsedJson : null;

  if (res.ok && ct.includes('application/json')) {
    if (httpEnv) {
      await idb.deleteVaultRecord().catch(() => {});
      return httpEnv;
    }
    return idbEnv;
  }

  if (res.status === 404 && ct.includes('application/json')) {
    return migrateIdbToFileIfPresent(idbEnv);
  }

  return idbEnv;
}

async function saveEnvelope(envelope: VaultEnvelopeBlob): Promise<void> {
  if (!prefersVaultFileApi()) {
    return idb.putVaultEnvelope(envelope as VaultEnvelope);
  }
  try {
    const res = await fetch(VAULT_HTTP_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    await idb.deleteVaultRecord().catch(() => {});
  } catch {
    await idb.putVaultEnvelope(envelope as VaultEnvelope);
  }
}

async function deleteEnvelope(): Promise<void> {
  if (!prefersVaultFileApi()) {
    return idb.deleteVaultRecord();
  }
  try {
    await fetch(VAULT_HTTP_PATH, { method: 'DELETE' });
  } catch {
    /* still clear IDB */
  }
  await idb.deleteVaultRecord();
}

export const browserSecretsHost: SecretsHost = {
  loadEnvelope,
  saveEnvelope,
  deleteEnvelope,
  // The browser has no OS secure store, so there is never an automatic unlock.
  async getAutoUnlockPassphrase() {
    return null;
  },
};
