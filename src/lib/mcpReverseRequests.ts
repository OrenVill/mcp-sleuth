export type ReverseRequestKind = 'sampling' | 'elicitation';

export interface PendingReverseRequest {
  id: string;
  serverId: string;
  kind: ReverseRequestKind;
  method: string;
  params: unknown;
  createdAt: number;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

let nextId = 1;
const pending = new Map<string, PendingReverseRequest>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function getPendingReverseRequests(): PendingReverseRequest[] {
  return [...pending.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function subscribePendingReverseRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerBridgedReverseRequest(input: {
  id: string;
  serverId: string;
  kind: ReverseRequestKind;
  method: string;
  params: unknown;
  complete: (result: unknown, errorMessage?: string) => void | Promise<void>;
}): void {
  if (pending.has(input.id)) return;
  pending.set(input.id, {
    id: input.id,
    serverId: input.serverId,
    kind: input.kind,
    method: input.method,
    params: input.params,
    createdAt: Date.now(),
    resolve: (result) => {
      pending.delete(input.id);
      notify();
      void input.complete(result);
    },
    reject: (error) => {
      pending.delete(input.id);
      notify();
      void input.complete(null, error.message);
    },
  });
  notify();
}

export function enqueueReverseRequest(input: {
  serverId: string;
  kind: ReverseRequestKind;
  method: string;
  params: unknown;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `rev-${nextId++}`;
    pending.set(id, {
      id,
      serverId: input.serverId,
      kind: input.kind,
      method: input.method,
      params: input.params,
      createdAt: Date.now(),
      resolve: (result) => {
        pending.delete(id);
        notify();
        resolve(result);
      },
      reject: (error) => {
        pending.delete(id);
        notify();
        reject(error);
      },
    });
    notify();
  });
}

export function resolvePendingReverseRequest(id: string, result: unknown): boolean {
  const item = pending.get(id);
  if (!item) return false;
  item.resolve(result);
  return true;
}

export function rejectPendingReverseRequest(id: string, message: string): boolean {
  const item = pending.get(id);
  if (!item) return false;
  item.reject(new Error(message));
  return true;
}

export function clearPendingReverseRequestsForServer(serverId: string): void {
  for (const item of pending.values()) {
    if (item.serverId === serverId) {
      item.reject(new Error('Server disconnected'));
    }
  }
}
