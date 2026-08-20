import type {
  PromptDef,
  PromptMessage,
  ResourceContent,
  ResourceEntry,
  ResourceTemplate,
  ServerAuth,
  ServerStdioConfig,
  ToolDef,
  ToolResult,
} from '../../types';

/**
 * Transport-level MCP operations. Implementations own the live client sessions.
 * Every method throws on failure; protocol tracing is applied by the caller
 * (`src/lib/mcpClient.ts`), never by an implementation.
 */
export interface McpHost {
  /** Open an HTTP session. Resolves once `initialize` has completed. */
  connect(
    serverId: string,
    url: string,
    auth: ServerAuth | undefined,
    proxyThroughLocal: boolean,
  ): Promise<void>;
  /** Open a session against a local stdio subprocess. */
  connectStdio(
    serverId: string,
    stdio: ServerStdioConfig,
    env: Record<string, string>,
  ): Promise<void>;
  disconnect(serverId: string): Promise<void>;
  isConnected(serverId: string): boolean;
  listTools(serverId: string): Promise<ToolDef[]>;
  callTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult>;
  listResources(serverId: string): Promise<{
    resources: ResourceEntry[];
    resourceTemplates: ResourceTemplate[];
  }>;
  readResource(serverId: string, uri: string): Promise<{ contents: ResourceContent[] }>;
  listPrompts(serverId: string): Promise<PromptDef[]>;
  getPrompt(
    serverId: string,
    name: string,
    args: Record<string, string>,
  ): Promise<PromptMessage[]>;
  /** Subscribe to `notifications/tools/list_changed`. Returns an unsubscribe fn. */
  onToolsChanged(serverId: string, handler: () => void): () => void;
}

/** The encrypted vault envelope, opaque at this layer. */
export type VaultEnvelopeBlob = unknown;

/**
 * Credential storage. The browser implementation has no OS secure store, so it
 * never offers an automatic unlock; Electron seals a generated passphrase with
 * `safeStorage` and unlocks the same PBKDF2 envelope without prompting.
 */
export interface SecretsHost {
  loadEnvelope(): Promise<VaultEnvelopeBlob | null>;
  saveEnvelope(envelope: VaultEnvelopeBlob): Promise<void>;
  deleteEnvelope(): Promise<void>;
  /**
   * A device-managed passphrase that unlocks the vault without prompting, or null
   * when this platform has no secure store and the user must type one.
   */
  getAutoUnlockPassphrase(): Promise<string | null>;
}

/** Writing generated content out of the app, and persisted app data. */
export interface FilesHost {
  saveFile(filename: string, content: string, mimeType: string): void;
  /** Persisted app data (bookmarks, history, journals), or null if none stored. */
  readAppData(): Promise<unknown | null>;
  writeAppData(data: unknown): Promise<void>;
}

export interface Host {
  readonly kind: 'browser' | 'electron';
  readonly mcp: McpHost;
  readonly files: FilesHost;
  readonly secrets: SecretsHost;
}
