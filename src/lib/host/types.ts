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

/** Writing generated content out of the app. */
export interface FilesHost {
  saveFile(filename: string, content: string, mimeType: string): void;
}

export interface Host {
  readonly kind: 'browser' | 'electron';
  readonly mcp: McpHost;
  readonly files: FilesHost;
}
