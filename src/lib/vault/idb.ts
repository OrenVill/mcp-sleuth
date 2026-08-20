import { IDB_NAME, IDB_RECORD_KEY, IDB_STORE, LEGACY_IDB_NAME } from './constants';
import type { VaultEnvelope } from './types';

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
  // The product was renamed; an existing browser vault still lives under the old
  // database name. Read it rather than orphaning it. Writes always go to the new
  // database, so this fallback quietly stops mattering after the next save.
  try {
    return await readFrom(LEGACY_IDB_NAME);
  } catch {
    return null;
  }
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
