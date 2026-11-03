import { readFile } from 'node:fs/promises';
import * as clack from '@clack/prompts';
import type { GlobalCliFlags, VaultContext } from '../contracts';
import { EXIT_USAGE } from '../exitCodes';
import type { StoredServer } from '../../lib/storage';
import { resolveServerByName, unlockVaultFromDisk } from './vaultSession';
import {
  loadCachedAesKey,
  openVaultWithAesKey,
  rememberUnlockedVault,
  touchVaultSession,
  clearVaultSession,
} from './vaultSessionCache';

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

async function readPassphrase(flags: GlobalCliFlags): Promise<string> {
  const fromEnv = process.env.MCP_DETECTIVE_VAULT_PASSPHRASE;
  if (fromEnv) return fromEnv;
  if (flags.passphraseFile) {
    return (await readFile(flags.passphraseFile, 'utf8')).trimEnd();
  }
  if (!process.stdin.isTTY) {
    throw new CliUsageError(
      'Non-interactive mode requires MCP_DETECTIVE_VAULT_PASSPHRASE or --passphrase-file.',
    );
  }
  const value = await clack.password({ message: 'Unlock your vault' });
  if (clack.isCancel(value) || !value) {
    throw new CliUsageError('Vault unlock cancelled.');
  }
  return value;
}

export async function resolveVaultContext(flags: GlobalCliFlags): Promise<VaultContext> {
  const cachedKey = await loadCachedAesKey(flags);
  if (cachedKey) {
    try {
      const ctx = await openVaultWithAesKey(cachedKey);
      await touchVaultSession();
      return ctx;
    } catch {
      await clearVaultSession();
    }
  }

  const passphrase = await readPassphrase(flags);
  const ctx = await unlockVaultFromDisk(passphrase);
  if (!process.env.MCP_DETECTIVE_VAULT_PASSPHRASE && !flags.passphraseFile) {
    await rememberUnlockedVault(ctx.aesKey);
  }
  return ctx;
}

/** Call once per interactive chat turn so the 30-minute vault session stays warm. */
export async function refreshVaultSessionActivity(): Promise<void> {
  await touchVaultSession();
}

export async function resolveVaultAndServer(
  flags: GlobalCliFlags,
): Promise<{ ctx: VaultContext; server: StoredServer }> {
  const ctx = await resolveVaultContext(flags);
  if (ctx.servers.length === 0) {
    throw new Error('No servers in vault. Add one with mcp-detective server add or in the app.');
  }

  let server: StoredServer;
  if (flags.server) {
    server = resolveServerByName(ctx.servers, flags.server);
  } else if (!process.stdin.isTTY) {
    throw new CliUsageError('Non-interactive mode requires --server <name>.');
  } else {
    const choice = await clack.select({
      message: 'Server',
      options: ctx.servers.map((s) => ({
        value: s.id,
        label: `${s.name} (${s.transport ?? 'http'})`,
      })),
    });
    if (clack.isCancel(choice)) {
      throw new CliUsageError('Server selection cancelled.');
    }
    server = resolveServerByName(ctx.servers, choice);
  }

  return { ctx, server };
}

export function usageExitCode(err: unknown): number {
  if (err instanceof CliUsageError) return EXIT_USAGE;
  return EXIT_USAGE;
}
