declare module '../../mcp/sessions.js' {
  export function createSessionManager(deps?: unknown): {
    connect(serverId: string, url: string, auth: unknown, options?: unknown): Promise<void>;
    connectStdio(serverId: string, stdio: unknown, env: unknown): Promise<void>;
    disconnect(serverId: string): Promise<void>;
    listTools(serverId: string): Promise<unknown[]>;
    callTool(serverId: string, name: string, args: Record<string, unknown>): Promise<unknown>;
    listResources(serverId: string): Promise<unknown>;
    listPrompts(serverId: string): Promise<unknown[]>;
    closeAll(): Promise<void>;
  };
}
