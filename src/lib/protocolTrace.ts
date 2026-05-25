export type ProtocolTraceStatus = 'pending' | 'ok' | 'unsupported' | 'error';

export interface ProtocolTraceEvent {
  id: string;
  serverId: string;
  method: string;
  params?: unknown;
  result?: unknown;
  error?: string;
  status: ProtocolTraceStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
}

export interface ProtocolTraceStart {
  serverId: string;
  method: string;
  params?: unknown;
}

const MAX_TRACE_EVENTS = 200;

let traces: ProtocolTraceEvent[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const SENSITIVE_KEY = /authorization|api[-_]?key|token|secret|password|bearer/i;

function redactPayload(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactPayload(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : redactPayload(child, seen),
    ]),
  );
}

function clonePayload<T>(value: T): T {
  if (value === undefined) return value;
  let cloned: unknown;
  if (typeof structuredClone === 'function') {
    try {
      cloned = structuredClone(value);
      return redactPayload(cloned) as T;
    } catch {
      /* fall back to JSON below */
    }
  }
  try {
    cloned = JSON.parse(JSON.stringify(value)) as unknown;
    return redactPayload(cloned) as T;
  } catch {
    return String(value) as T;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isMethodNotFoundError(error: unknown): boolean {
  const message = errorMessage(error);
  if (/method not found/i.test(message) || /-32601/.test(message)) return true;
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    return code === -32601 || code === '-32601';
  }
  return false;
}

function notify() {
  listeners.forEach((listener) => listener());
}

function upsertTrace(event: ProtocolTraceEvent) {
  traces = [event, ...traces.filter((trace) => trace.id !== event.id)].slice(0, MAX_TRACE_EVENTS);
  notify();
}

export function getProtocolTraces(): ProtocolTraceEvent[] {
  return traces.map((trace) => clonePayload(trace));
}

export function clearProtocolTraces(): void {
  traces = [];
  notify();
}

export function subscribeProtocolTraces(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function traceProtocolCall<T>(
  start: ProtocolTraceStart,
  call: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  const event: ProtocolTraceEvent = {
    id: `trace-${nextId++}`,
    serverId: start.serverId,
    method: start.method,
    params: clonePayload(start.params),
    status: 'pending',
    startedAt,
  };
  upsertTrace(event);

  try {
    const result = await call();
    const finishedAt = Date.now();
    upsertTrace({
      ...event,
      status: 'ok',
      result: clonePayload(result),
      finishedAt,
      durationMs: finishedAt - startedAt,
    });
    return result;
  } catch (error) {
    const finishedAt = Date.now();
    upsertTrace({
      ...event,
      status: 'error',
      error: errorMessage(error),
      finishedAt,
      durationMs: finishedAt - startedAt,
    });
    throw error;
  }
}

export async function traceOptionalProtocolCall<T>(
  start: ProtocolTraceStart,
  call: () => Promise<T>,
  fallback: T,
): Promise<T> {
  const startedAt = Date.now();
  const event: ProtocolTraceEvent = {
    id: `trace-${nextId++}`,
    serverId: start.serverId,
    method: start.method,
    params: clonePayload(start.params),
    status: 'pending',
    startedAt,
  };
  upsertTrace(event);

  try {
    const result = await call();
    const finishedAt = Date.now();
    upsertTrace({
      ...event,
      status: 'ok',
      result: clonePayload(result),
      finishedAt,
      durationMs: finishedAt - startedAt,
    });
    return result;
  } catch (error) {
    const finishedAt = Date.now();
    if (isMethodNotFoundError(error)) {
      upsertTrace({
        ...event,
        status: 'unsupported',
        result: clonePayload(fallback),
        error: 'Server does not support this optional MCP capability.',
        finishedAt,
        durationMs: finishedAt - startedAt,
      });
      return fallback;
    }

    upsertTrace({
      ...event,
      status: 'error',
      error: errorMessage(error),
      finishedAt,
      durationMs: finishedAt - startedAt,
    });
    throw error;
  }
}
