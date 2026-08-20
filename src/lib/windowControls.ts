/**
 * Minimise / maximise / close for the frameless desktop window.
 *
 * This deliberately sits outside the `Host` abstraction: window chrome is not a
 * capability the browser build has an equivalent of, it is decoration that only
 * exists because the Electron window is frameless.
 */
interface Envelope {
  ok: boolean;
  value?: unknown;
  error?: { code: string; message: string };
}

interface WindowBridge {
  platform?: string;
  invoke(channel: string, ...args: unknown[]): Promise<Envelope>;
  onMaximizedChanged?(handler: (maximized: boolean) => void): () => void;
}

function bridge(): WindowBridge | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { mcpSleuth?: WindowBridge }).mcpSleuth;
  return candidate && typeof candidate.invoke === 'function' ? candidate : null;
}

async function call<T>(channel: string): Promise<T | null> {
  const api = bridge();
  if (!api) return null;
  const envelope = await api.invoke(channel);
  if (!envelope.ok) return null;
  return envelope.value as T;
}

/** True when this build draws its own window controls (frameless, non-macOS). */
export function hasCustomWindowControls(): boolean {
  const api = bridge();
  return api !== null && api.platform !== undefined && api.platform !== 'darwin';
}

export const windowControls = {
  minimize: () => void call('mcp:windowMinimize'),
  toggleMaximize: () => void call('mcp:windowMaximizeToggle'),
  close: () => void call('mcp:windowClose'),
  isMaximized: () => call<boolean>('mcp:windowIsMaximized'),
  onMaximizedChanged(handler: (maximized: boolean) => void): () => void {
    return bridge()?.onMaximizedChanged?.(handler) ?? (() => {});
  },
};
