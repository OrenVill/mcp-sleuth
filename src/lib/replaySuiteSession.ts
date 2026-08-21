import type { ReplaySuite } from './replaySuites';

/**
 * Replay suites live for the session only, as they always have. This module
 * exists so more than one surface can reach them: the panel that authors them
 * and the agent chat, which captures a run as a suite. Same push/subscribe
 * shape as protocolTrace.ts.
 */
let suites: ReplaySuite[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getSessionSuites(): ReplaySuite[] {
  return suites;
}

export function setSessionSuites(next: ReplaySuite[]): void {
  suites = next;
  emit();
}

export function addSessionSuite(suite: ReplaySuite): void {
  suites = [suite, ...suites];
  emit();
}

export function subscribeSessionSuites(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only. */
export function resetSessionSuites(): void {
  suites = [];
  listeners.clear();
}
