import type { ProtocolTraceEvent } from './protocolTrace';

export type ProtocolDiffKind = 'added' | 'removed' | 'changed';

export interface ProtocolDiffEntry {
  path: string;
  label: string;
  left: unknown;
  right: unknown;
  kind: ProtocolDiffKind;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function appendPath(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

function diffKind(left: unknown, right: unknown): ProtocolDiffKind {
  if (left === undefined) return 'added';
  if (right === undefined) return 'removed';
  return 'changed';
}

function labelFor(path: string): string {
  if (path === 'status') return 'Status changed';
  if (path === 'durationMs') return 'Duration changed';
  if (path === 'error') return 'Error changed';
  if (path === 'unsupported') return 'Unsupported capability changed';
  if (path.startsWith('params')) return 'Params changed';
  if (path.startsWith('result')) return 'Result changed';
  return 'Value changed';
}

export function diffValues(left: unknown, right: unknown, basePath: string): ProtocolDiffEntry[] {
  if (isEqual(left, right)) return [];

  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    const diffs: ProtocolDiffEntry[] = [];
    for (let index = 0; index < length; index++) {
      diffs.push(...diffValues(left[index], right[index], appendPath(basePath, String(index))));
    }
    return diffs;
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    return keys.flatMap((key) => diffValues(left[key], right[key], appendPath(basePath, key)));
  }

  return [
    {
      path: basePath,
      label: labelFor(basePath),
      left,
      right,
      kind: diffKind(left, right),
    },
  ];
}

function isUnsupported(trace: ProtocolTraceEvent): boolean {
  return trace.status === 'unsupported';
}

export function diffProtocolTraces(
  left: ProtocolTraceEvent,
  right: ProtocolTraceEvent,
): ProtocolDiffEntry[] {
  const diffs: ProtocolDiffEntry[] = [];

  diffs.push(...diffValues(left.params, right.params, 'params'));
  diffs.push(...diffValues(left.result, right.result, 'result'));
  diffs.push(...diffValues(left.status, right.status, 'status'));
  diffs.push(...diffValues(left.durationMs, right.durationMs, 'durationMs'));
  diffs.push(...diffValues(left.error, right.error, 'error'));
  diffs.push(...diffValues(isUnsupported(left), isUnsupported(right), 'unsupported'));

  return diffs;
}
