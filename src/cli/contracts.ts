import type { LlmConfig } from '../lib/agent/types';
import type { StoredServer } from '../lib/storage';

export type GlobalCliFlags = {
  json?: boolean;
  output?: string;
  server?: string;
  passphraseFile?: string;
  discover?: boolean;
  providerId?: string;
  servers?: string;
};

export type VaultContext = {
  servers: StoredServer[];
  llmConfigs: LlmConfig[];
  aesKey: CryptoKey;
};

export type CommandHandler = (args: string[], flags: GlobalCliFlags) => Promise<number>;
