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

/** What the renderer is allowed to know about updates. Decided in main. */
export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  /** A newer release exists and was not skipped — the header badge shows. */
  updateAvailable: boolean;
  /** …and was not dismissed either — the banner shows. */
  showBanner: boolean;
  releaseName: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
  autoCheck: boolean;
  lastCheckedAt: number | null;
  /** Set only by a check the user asked for; background failures stay quiet. */
  lastError: string | null;
}

/**
 * Update notification. Deliberately notify-only: the builds are unsigned, so the
 * app can point at the release page but cannot install anything.
 *
 * The browser build has no update channel — every read resolves null and the
 * renderer draws neither the banner nor the version pill, with no platform check
 * in the UI.
 */
export interface UpdateHost {
  getStatus(): Promise<UpdateStatus | null>;
  /** A user-initiated check. Reports its own failure through `lastError`. */
  check(): Promise<UpdateStatus | null>;
  setAutoCheck(enabled: boolean): Promise<UpdateStatus | null>;
  /** Silence this version entirely, banner and badge. */
  skip(version: string): Promise<UpdateStatus | null>;
  /** Collapse the banner to the badge for this version. */
  dismiss(version: string): Promise<UpdateStatus | null>;
  /** Open the release page in the user's browser. */
  openRelease(): Promise<void>;
  /** Fires when a scheduled check finds a release. Returns an unsubscribe fn. */
  onUpdateAvailable(handler: (status: UpdateStatus) => void): () => void;
}

export interface Host {
  readonly kind: 'browser' | 'electron';
  readonly mcp: McpHost;
  readonly files: FilesHost;
  readonly secrets: SecretsHost;
  readonly updates: UpdateHost;
}
