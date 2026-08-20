import type { IncomingMessage, ServerResponse } from 'node:http';

export const STDIO_BRIDGE_PREFIX: string;
export function handleStdioBridge(req: IncomingMessage, res: ServerResponse): Promise<void>;
