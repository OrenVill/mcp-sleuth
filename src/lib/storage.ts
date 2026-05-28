import type { ServerEntry } from '../types';
import { LEGACY_SERVERS_STORAGE_KEY } from './vault/constants';

export type StoredServer = Pick<
  ServerEntry,
  | 'id'
  | 'name'
  | 'url'
  | 'description'
  | 'custom'
  | 'auth'
  | 'proxyThroughLocal'
  | 'transport'
  | 'stdio'
  | 'stdioEnv'
>;

export { LEGACY_SERVERS_STORAGE_KEY };

export function loadLegacyServers(): StoredServer[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_SERVERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as StoredServer[];
  } catch {
    return null;
  }
}

export function clearLegacyServers(): void {
  try {
    localStorage.removeItem(LEGACY_SERVERS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
