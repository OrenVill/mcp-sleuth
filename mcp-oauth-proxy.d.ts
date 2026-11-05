import type { IncomingMessage, ServerResponse } from 'node:http';

export declare const MCP_OAUTH_PROXY_PATH: string;
export declare function isMcpOAuthProxyRequest(url: string): boolean;
export declare function handleMcpOAuthProxy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void>;
export declare function isSameOriginRequest(req: IncomingMessage): boolean;
