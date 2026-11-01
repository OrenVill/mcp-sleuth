import { IDB_NAME, IDB_RECORD_KEY, IDB_STORE, LEGACY_IDB_NAME, PRIOR_IDB_NAME } from './constants';
import type { VaultEnvelope } from './types';

const LEGACY_IDB_NAMES = [PRIOR_IDB_NAME, LEGACY_IDB_NAME] as const;

function openDb(name: string = IDB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/**
 * Read the envelope out of one database, or null.
 *
 * Opening a non-existent database creates an empty one, which is harmless here:
 * it has no record, so this returns null and the caller moves on.
 */
function readFrom(name: string): Promise<VaultEnvelope | null> {
  return openDb(name).then((db) => new Promise<VaultEnvelope | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const g = store.get(IDB_RECORD_KEY);
    g.onerror = () => {
      db.close();
      reject(g.error);
    };
    g.onsuccess = () => resolve((g.result as VaultEnvelope | undefined) ?? null);
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.oncomplete = () => db.close();
  }));
}

export async function getVaultEnvelope(): Promise<VaultEnvelope | null> {
  const current = await readFrom(IDB_NAME);
  if (current) return current;
  // Older releases stored the envelope under prior IndexedDB names. Read and
  // copy forward so the next save lands in the current database.
  for (const name of LEGACY_IDB_NAMES) {
    try {
      const legacy = await readFrom(name);
      if (legacy) {
        await putVaultEnvelope(legacy);
        return legacy;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function putVaultEnvelope(envelope: VaultEnvelope): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(envelope, IDB_RECORD_KEY);
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

export async function deleteVaultRecord(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_RECORD_KEY);
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}
