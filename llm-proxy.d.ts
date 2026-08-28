import type { IncomingMessage, ServerResponse } from 'node:http';

export declare const LLM_PROXY_PATH: string;
export declare function isLlmProxyRequest(url: string): boolean;
export declare function isAllowedTarget(provider: string, targetUrl: URL): boolean;
export declare function handleLlmProxy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void>;
export declare function isSameOriginRequest(req: IncomingMessage): boolean;
