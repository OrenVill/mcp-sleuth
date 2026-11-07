/**
 * Bridges server-initiated MCP requests from the Electron main process to the
 * renderer approval UI. Live in main; promises resolve when the user acts in UI.
 */

const DEFAULT_ROOTS = [{ uri: 'file:///', name: 'Filesystem root' }];

let nextId = 1;
/** @type {Map<string, { serverId: string; resolve: (v: unknown) => void; reject: (e: Error) => void }>} */
const pending = new Map();

/** @type {{ pushPending?: (p: unknown) => void; pushInbound?: (p: unknown) => void } | null} */
let hooks = null;

/** @type {Array<{ uri: string; name?: string }>} */
let mcpRoots = DEFAULT_ROOTS.map((r) => ({ ...r }));

export function configureReverseBridgeHandlers({ pushPending, pushInbound }) {
  hooks = { pushPending, pushInbound };
}

export function setMcpRoots(roots) {
  if (!Array.isArray(roots) || roots.length === 0) {
    mcpRoots = DEFAULT_ROOTS.map((r) => ({ ...r }));
    return;
  }
  mcpRoots = roots
    .filter((r) => r && typeof r === 'object' && typeof r.uri === 'string' && r.uri.trim())
    .map((r) => ({
      uri: r.uri.trim(),
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : undefined,
    }));
}

export function getMcpRoots() {
  return mcpRoots.map((r) => ({ ...r }));
}

/**
 * @param {{ serverId: string; kind: 'sampling' | 'elicitation'; method: string; params: unknown }} input
 */
export function waitForReverseApproval(input) {
  return new Promise((resolve, reject) => {
    const id = `rev-main-${nextId++}`;
    pending.set(id, { serverId: input.serverId, resolve, reject });
    hooks?.pushPending?.({ id, ...input });
  });
}

export function notifyInbound(entry) {
  hooks?.pushInbound?.(entry);
}

export function resolveReverseApproval(id, result) {
  const item = pending.get(id);
  if (!item) return false;
  pending.delete(id);
  item.resolve(result);
  return true;
}

export function rejectReverseApproval(id, message) {
  const item = pending.get(id);
  if (!item) return false;
  pending.delete(id);
  item.reject(new Error(message || 'Denied by user'));
  return true;
}

export function clearReverseApprovalsForServer(serverId) {
  for (const [id, item] of pending) {
    if (item.serverId !== serverId) continue;
    item.reject(new Error('Server disconnected'));
    pending.delete(id);
  }
}

export function rejectAllPendingReverse(message) {
  for (const [id, item] of pending) {
    item.reject(new Error(message));
    pending.delete(id);
  }
}
