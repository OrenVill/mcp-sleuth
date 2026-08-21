import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bootstrapVault, createVault, resetVault, saveVault, unlockVault } from '../lib/vault/service';
import { fromStoredServers, toStoredServers } from '../lib/serverRecord';
import { loadLegacyServers } from '../lib/storage';
import { initAppData } from '../lib/appData';
import { disconnect } from '../lib/mcpClient';
import type { ServerEntry } from '../types';

export type VaultPhase = 'loading' | 'needs-setup' | 'needs-unlock' | 'ready';

interface Options {
  servers: ServerEntry[];
  setServers: (servers: ServerEntry[]) => void;
  /** Called when the vault locks or resets, so the app can drop its selection. */
  onCleared: () => void;
}

export interface Vault {
  phase: VaultPhase;
  error: string | null;
  busy: boolean;
  create: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  reset: () => Promise<void>;
}

/**
 * Owns the vault lifecycle: bootstrap, unlock, save-on-change, and the
 * best-effort flush before the window goes away.
 *
 * Extracted from App.tsx, which was carrying this alongside server CRUD,
 * connection lifecycle, discovery, and every modal's state.
 */
export function useVault({ servers, setServers, onCleared }: Options): Vault {
  const [phase, setPhase] = useState<VaultPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const aesKeyRef = useRef<CryptoKey | null>(null);
  const serversRef = useRef<ServerEntry[]>(servers);
  const phaseRef = useRef<VaultPhase>(phase);

  useLayoutEffect(() => {
    serversRef.current = servers;
    phaseRef.current = phase;
  }, [servers, phase]);

  useEffect(() => {
    void (async () => {
      await initAppData().catch(() => {
        /* silent — falls back to in-memory defaults */
      });
      try {
        const result = await bootstrapVault();
        if (result.phase === 'ready') {
          aesKeyRef.current = result.aesKey;
          setServers(fromStoredServers(result.servers));
          setPhase('ready');
        } else {
          setPhase(result.phase);
        }
      } catch {
        setError('Could not initialize vault.');
        setPhase('needs-setup');
      }
    })();
    // Runs once on mount; setServers is stable for the lifetime of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'ready' || !aesKeyRef.current) return;
    void saveVault(aesKeyRef.current, toStoredServers(servers)).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Vault save failed: ${message}`);
    });
  }, [servers, phase]);

  /** Best-effort flush before tab close or crash, so storage has the latest ciphertext. */
  useEffect(() => {
    function flush() {
      const key = aesKeyRef.current;
      if (phaseRef.current !== 'ready' || !key) return;
      void saveVault(key, toStoredServers(serversRef.current)).catch((err: unknown) => {
        console.error('sleuth: vault background save failed', err);
      });
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flush();
    }

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const create = useCallback(
    async (passphrase: string) => {
      setBusy(true);
      setError(null);
      try {
        const legacyServers = loadLegacyServers() ?? [];
        aesKeyRef.current = await createVault(passphrase, legacyServers);
        setServers(fromStoredServers(legacyServers));
        setPhase('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create vault.');
      } finally {
        setBusy(false);
      }
    },
    [setServers],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      setBusy(true);
      setError(null);
      try {
        const { aesKey, servers: stored } = await unlockVault(passphrase);
        aesKeyRef.current = aesKey;
        setServers(fromStoredServers(stored));
        setPhase('ready');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not unlock vault.');
      } finally {
        setBusy(false);
      }
    },
    [setServers],
  );

  const lock = useCallback(() => {
    const snapshot = serversRef.current;
    setPhase('needs-unlock');
    setError(null);
    onCleared();
    // Drop the key only once the sockets are closed, so a disconnect failure
    // cannot leave a live session attached to a locked vault.
    void Promise.allSettled(
      snapshot.filter((s) => s.status === 'connected').map((s) => disconnect(s.id)),
    ).finally(() => {
      aesKeyRef.current = null;
      setServers([]);
    });
  }, [onCleared, setServers]);

  const reset = useCallback(async () => {
    setBusy(true);
    try {
      await resetVault();
      aesKeyRef.current = null;
      setServers([]);
      onCleared();
      setError(null);
      setPhase('needs-setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset vault.');
    } finally {
      setBusy(false);
    }
  }, [onCleared, setServers]);

  return { phase, error, busy, create, unlock, lock, reset };
}
