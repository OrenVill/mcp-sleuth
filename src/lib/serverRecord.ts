import type { StoredServer } from './storage';
import type { ServerEntry } from '../types';

/**
 * Conversions between the vault's persisted shape and the in-memory server
 * entry. Pure, so the defaults that matter — connection status is never
 * restored, proxying is on unless stored otherwise — are testable directly.
 */

export function fromStoredServers(stored: StoredServer[]): ServerEntry[] {
  return stored.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url ?? '',
    description: s.description,
    auth: s.auth,
    proxyThroughLocal: s.proxyThroughLocal ?? true,
    transport: s.transport ?? 'http',
    stdio: s.stdio,
    stdioEnv: s.stdioEnv,
    custom: s.custom ?? true,
    // Connections are never restored: a stored server is always disconnected
    // until the user asks for it.
    status: 'disconnected',
  }));
}

export function toStoredServers(servers: ServerEntry[]): StoredServer[] {
  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    url: server.url,
    description: server.description,
    custom: server.custom,
    auth: server.auth,
    proxyThroughLocal: server.proxyThroughLocal ?? true,
    transport: server.transport,
    stdio: server.stdio,
    stdioEnv: server.stdioEnv,
  }));
}

/** A stable, filesystem-safe id derived from the server name, unique within `existing`. */
export function makeId(name: string, existing: Set<string>): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'server';
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
