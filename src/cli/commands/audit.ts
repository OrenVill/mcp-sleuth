import type { GlobalCliFlags } from '../contracts';
import {
  diffContractCorpora,
  diffServerToSnapshot,
  diffSnapshots,
  formatContractDriftMarkdown,
} from '../../lib/contractDrift';
import {
  buildSnapshotFromServer,
  type ContractSnapshot,
  type ContractSnapshotsStore,
} from '../../lib/contractSnapshots';
import { auditPermissionSurface, categoryLabel } from '../../lib/permissionSurfaceAudit';
import { scanPromptInjection, locationLabel } from '../../lib/promptInjectionScan';
import { emitJson, emitMarkdown } from '../core/output';
import { loadAppDataFromDisk } from '../core/appDataNode';
import { EXIT_OK, runCommandSafe, withConnectedTools } from '../core/runContext';
import { EXIT_USAGE } from '../exitCodes';

function permissionMarkdown(report: ReturnType<typeof auditPermissionSurface>): string {
  const s = report.servers[0];
  if (!s) return '# Permission surface\n\n(no data)\n';
  const lines = [`# Permission surface — ${s.serverName}`, '', s.riskSummary, ''];
  for (const tool of s.tools) {
    lines.push(`## ${tool.toolName}`);
    for (const cat of tool.categories) lines.push(`- ${categoryLabel(cat)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function injectionMarkdown(report: ReturnType<typeof scanPromptInjection>, serverName: string): string {
  const lines = [
    `# Prompt injection scan — ${serverName}`,
    '',
    `Scanned ${report.scannedToolCount} tool(s); ${report.findings.length} finding(s).`,
    '',
  ];
  for (const f of report.findings) {
    lines.push(`- **${f.toolName}** ${locationLabel(f.location)}: \`${f.matchedText}\``);
  }
  return lines.join('\n');
}

function findSnapshotInStore(
  store: ContractSnapshotsStore,
  snapshotId: string,
): ContractSnapshot | null {
  for (const snapshots of Object.values(store)) {
    const hit = snapshots.find((s) => s.id === snapshotId);
    if (hit) return hit;
  }
  return null;
}

function readFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = args.indexOf(name);
  if (idx >= 0) return args[idx + 1];
  return undefined;
}

export async function runAudit(args: string[], flags: GlobalCliFlags): Promise<number> {
  const sub = args[0];
  if (sub !== 'permission' && sub !== 'injection' && sub !== 'contract') {
    process.stderr.write('Usage: mcp-detective audit permission|injection|contract\n');
    return EXIT_USAGE;
  }
  return runCommandSafe(async () => {
    await withConnectedTools(flags, async ({ entry }) => {
      if (sub === 'permission') {
        const report = auditPermissionSurface([entry]);
        if (flags.json) await emitJson(report, flags);
        else await emitMarkdown(permissionMarkdown(report), flags);
      } else if (sub === 'injection') {
        const report = scanPromptInjection([entry]);
        if (flags.json) await emitJson(report, flags);
        else await emitMarkdown(injectionMarkdown(report, entry.name), flags);
      } else {
        const appData = await loadAppDataFromDisk();
        const store = appData?.contractSnapshots ?? {};
        const serverSnapshots = store[entry.id] ?? [];
        const fromId = readFlag(args, '--from');
        const toId = readFlag(args, '--to');
        const baselineId = readFlag(args, '--baseline');
        let report;
        if (fromId && toId) {
          const left = findSnapshotInStore(store, fromId);
          const right = findSnapshotInStore(store, toId);
          if (!left || !right) throw new Error('Could not find both snapshots.');
          report = diffSnapshots(left, right);
        } else {
          const baseline =
            (baselineId ? findSnapshotInStore(store, baselineId) : null) ??
            serverSnapshots.sort((a, b) => b.createdAt - a.createdAt)[0];
          report = baseline
            ? diffServerToSnapshot(entry, baseline)
            : diffContractCorpora(
                { label: 'empty baseline', tools: [] },
                { label: `${entry.name} (live)`, tools: buildSnapshotFromServer(entry).tools },
              );
        }
        if (flags.json) await emitJson(report, flags);
        else await emitMarkdown(formatContractDriftMarkdown(report), flags);
      }
    });
    return EXIT_OK;
  });
}
