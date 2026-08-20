import type { IncomingMessage, ServerResponse } from 'node:http';

export const PROXY_PATH: string;
export function handleMcpProxy(req: IncomingMessage, res: ServerResponse): void;
