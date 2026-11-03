import type { GlobalCliFlags } from '../contracts';
import { auditPermissionSurface, categoryLabel } from '../../lib/permissionSurfaceAudit';
import { scanPromptInjection, locationLabel } from '../../lib/promptInjectionScan';
import { emitJson, emitMarkdown } from '../core/output';
import { EXIT_OK, runCommandSafe, withConnectedTools } from '../core/runContext';
import { EXIT_USAGE } from '../exitCodes';

function permissionMarkdown(report: ReturnType<typeof auditPermissionSurface>): string {
  const s = report.servers[0];
  if (!s) return '# Permission surface\n\n(no data)\n';
  const lines = [`# Permission surface — ${s.serverName}`, '', s.riskSummary, ''];
  for (const tool of s.tools) {
    lines.push(`## ${tool.toolName}`);
    for (const cat of tool.categories) {
      lines.push(`- ${categoryLabel(cat)}`);
    }
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

export async function runAudit(args: string[], flags: GlobalCliFlags): Promise<number> {
  const sub = args[0];
  if (sub !== 'permission' && sub !== 'injection') {
    process.stderr.write('Usage: mcp-detective audit permission|injection\n');
    return EXIT_USAGE;
  }
  return runCommandSafe(async () => {
    await withConnectedTools(flags, async ({ entry }) => {
      if (sub === 'permission') {
        const report = auditPermissionSurface([entry]);
        if (flags.json) {
          await emitJson(report, flags);
        } else {
          await emitMarkdown(permissionMarkdown(report), flags);
        }
      } else {
        const report = scanPromptInjection([entry]);
        if (flags.json) {
          await emitJson(report, flags);
        } else {
          await emitMarkdown(injectionMarkdown(report, entry.name), flags);
        }
      }
    });
    return EXIT_OK;
  });
}
