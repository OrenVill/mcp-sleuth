import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type TransportHandler = (...args: unknown[]) => void;

/** Chain transport callbacks without dropping handlers the SDK installed. */
export function chainHandler(
  existing: TransportHandler | undefined,
  next: TransportHandler,
): TransportHandler {
  if (typeof existing !== 'function') return next;
  return (...args: unknown[]) => {
    try {
      existing(...args);
    } catch {
      /* ignore */
    }
    next(...args);
  };
}

export function isSseDisconnectSuspect(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /maximum reconnection attempts|sse stream disconnected|failed to reconnect sse stream/i.test(
    msg,
  );
}

/** Whether an MCP HTTP error indicates the Streamable HTTP session id is stale. */
export function isSessionLostError(err: unknown): boolean {
  if (err instanceof UnauthorizedError) return false;
  if (err instanceof StreamableHTTPError) {
    if (err.code === 401 || err.code === 403) return false;
    if (err.code === 404) return true;
    if (err.code === 400) {
      const raw = err.message.toLowerCase();
      if (raw.includes('not initialized') || raw.includes('server not initialized')) {
        return true;
      }
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/session (not found|expired|invalid)/i.test(msg)) return true;
  if (/bad request:\s*server not initialized/i.test(msg)) return true;
  return false;
}

/** Server unreachable or hard-down (not a stale session id). */
export function isConnectionDeadError(err: unknown): boolean {
  if (err instanceof StreamableHTTPError) {
    return err.code === 502 || err.code === 503 || err.code === 504;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /econnrefused|enotfound|failed to fetch|network error|networkerror/i.test(msg);
}

export function isOAuthUnauthorizedError(
  err: unknown,
  auth: { method?: string } | undefined,
): boolean {
  if (auth?.method !== 'oauth') return false;
  if (err instanceof UnauthorizedError) return true;
  if (err instanceof StreamableHTTPError && err.code === 401) return true;
  return false;
}
