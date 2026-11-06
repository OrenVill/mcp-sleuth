import { diffValues, type ProtocolDiffEntry } from './protocolDiff';
import type { ContractSnapshot, ToolContract } from './contractSnapshots';
import type { ServerEntry } from '../types';
import { buildSnapshotFromServer } from './contractSnapshots';

export interface ContractToolChange {
  toolName: string;
  diffs: ProtocolDiffEntry[];
}

export interface ContractDriftReport {
  leftLabel: string;
  rightLabel: string;
  addedToolNames: string[];
  removedToolNames: string[];
  changedTools: ContractToolChange[];
  unchangedCount: number;
}

function toolMap(tools: ToolContract[]): Map<string, ToolContract> {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

export function diffContractCorpora(
  left: { label: string; tools: ToolContract[] },
  right: { label: string; tools: ToolContract[] },
): ContractDriftReport {
  const leftMap = toolMap(left.tools);
  const rightMap = toolMap(right.tools);
  const names = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()])).sort();

  const addedToolNames: string[] = [];
  const removedToolNames: string[] = [];
  const changedTools: ContractToolChange[] = [];
  let unchangedCount = 0;

  for (const name of names) {
    const l = leftMap.get(name);
    const r = rightMap.get(name);
    if (!l && r) {
      addedToolNames.push(name);
      continue;
    }
    if (l && !r) {
      removedToolNames.push(name);
      continue;
    }
    if (!l || !r) continue;
    const diffs = diffValues(l, r, name);
    if (diffs.length === 0) unchangedCount += 1;
    else changedTools.push({ toolName: name, diffs });
  }

  return {
    leftLabel: left.label,
    rightLabel: right.label,
    addedToolNames,
    removedToolNames,
    changedTools,
    unchangedCount,
  };
}

export function diffSnapshots(left: ContractSnapshot, right: ContractSnapshot): ContractDriftReport {
  return diffContractCorpora(
    { label: left.label ?? left.id, tools: left.tools },
    { label: right.label ?? right.id, tools: right.tools },
  );
}

export function diffServerToSnapshot(
  server: ServerEntry,
  snapshot: ContractSnapshot,
): ContractDriftReport {
  const live = buildSnapshotFromServer(server);
  return diffContractCorpora(
    { label: snapshot.label ?? `Snapshot ${snapshot.id}`, tools: snapshot.tools },
    { label: `${server.name} (live)`, tools: live.tools },
  );
}

export function diffTwoServers(left: ServerEntry, right: ServerEntry): ContractDriftReport {
  const leftSnap = buildSnapshotFromServer(left);
  const rightSnap = buildSnapshotFromServer(right);
  return diffContractCorpora(
    { label: left.name, tools: leftSnap.tools },
    { label: right.name, tools: rightSnap.tools },
  );
}

export function formatContractDriftMarkdown(report: ContractDriftReport): string {
  const lines = [
    `# Contract drift — ${report.leftLabel} → ${report.rightLabel}`,
    '',
    `${report.unchangedCount} unchanged; ${report.addedToolNames.length} added; ${report.removedToolNames.length} removed; ${report.changedTools.length} changed.`,
    '',
  ];
  if (report.addedToolNames.length) {
    lines.push('## Added', ...report.addedToolNames.map((n) => `- ${n}`), '');
  }
  if (report.removedToolNames.length) {
    lines.push('## Removed', ...report.removedToolNames.map((n) => `- ${n}`), '');
  }
  if (
    !report.addedToolNames.length &&
    !report.removedToolNames.length &&
    !report.changedTools.length
  ) {
    lines.push('No drift detected.', '');
  }
  return lines.join('\n');
}
