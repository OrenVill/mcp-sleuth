import type { IncomingMessage, ServerResponse } from 'node:http';

export const VAULT_STORAGE_URL_PATH: string;
export function isVaultStorageRequest(url: string | undefined): boolean;
export function getVaultFilePath(): string;
export function handleVaultStorage(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void>;
