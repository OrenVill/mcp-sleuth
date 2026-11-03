import {
  quickWinsFor,
  readinessLabel,
  type AgentReadinessIssue,
  type AgentReadinessSeverity,
  type AgentReadinessToolReport,
  type AgentReadinessVerdict,
} from './agentReadiness';

export interface ReadinessMarkdownOptions {
  generatedAt?: string;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function escapeInline(value: string): string {
  return (value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/`/g, "'")
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function capitalizeSeverity(severity: AgentReadinessSeverity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function issueTarget(issue: AgentReadinessIssue): string {
  if (issue.path) {
    return `parameter \`${escapeInline(issue.path)}\``;
  }
  return 'tool';
}

function countBySeverity(issues: AgentReadinessIssue[]): Record<AgentReadinessSeverity, number> {
  return {
    critical: issues.filter((issue) => issue.severity === 'critical').length,
    high: issues.filter((issue) => issue.severity === 'high').length,
    medium: issues.filter((issue) => issue.severity === 'medium').length,
    low: issues.filter((issue) => issue.severity === 'low').length,
  };
}

function issueSummaryLine(issues: AgentReadinessIssue[]): string {
  const counts = countBySeverity(issues);
  return `**Issues:** ${issues.length} (${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low)`;
}

function issueBlock(issue: AgentReadinessIssue, headingLevel: 3 | 4): string[] {
  const hashes = '#'.repeat(headingLevel);
  const heading = `${hashes} ${capitalizeSeverity(issue.severity)} — ${issueTarget(issue)}`;
  return [
    heading,
    `- **Message:** ${escapeInline(issue.message)}`,
    `- **Recommendation:** ${escapeInline(issue.recommendation)}`,
    `- **Id:** \`${escapeInline(issue.id)}\``,
    '',
  ];
}

function issueGroupKey(issue: AgentReadinessIssue): string {
  return `${issue.id}\0${issue.message}`;
}

function compareIssuesBySeverityThenId(
  a: AgentReadinessIssue,
  b: AgentReadinessIssue,
): number {
  const severityOrder: Record<AgentReadinessSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return (
    severityOrder[a.severity] - severityOrder[b.severity] ||
    a.id.localeCompare(b.id) ||
    a.message.localeCompare(b.message)
  );
}

function sortedUniqueToolNames(toolNames: string[]): string[] {
  return [...new Set(toolNames)].sort((a, b) => a.localeCompare(b));
}

function sharedFindingLines(issue: AgentReadinessIssue, toolNames: string[]): string[] {
  const names = sortedUniqueToolNames(toolNames);
  const toolList = names.map((name) => `\`${escapeInline(name)}\``).join(', ');
  return [
    `- **${escapeInline(issue.message)}** (${names.length} tools): ${toolList}`,
    `- **Recommendation:** ${escapeInline(issue.recommendation)}`,
    `- **Id:** \`${escapeInline(issue.id)}\``,
    '',
  ];
}

function buildServerIssueGroups(tools: AgentReadinessToolReport[]): {
  shared: { issue: AgentReadinessIssue; toolNames: string[] }[];
  uniqueByTool: Map<string, AgentReadinessIssue[]>;
} {
  const groupMembers = new Map<string, { issue: AgentReadinessIssue; toolNames: string[] }>();

  for (const tool of tools) {
    for (const toolIssue of tool.issues) {
      const key = issueGroupKey(toolIssue);
      const existing = groupMembers.get(key);
      if (existing) {
        existing.toolNames.push(tool.toolName);
      } else {
        groupMembers.set(key, { issue: toolIssue, toolNames: [tool.toolName] });
      }
    }
  }

  const shared: { issue: AgentReadinessIssue; toolNames: string[] }[] = [];
  const uniqueByTool = new Map<string, AgentReadinessIssue[]>();

  for (const { issue, toolNames } of groupMembers.values()) {
    const distinctTools = sortedUniqueToolNames(toolNames);
    if (distinctTools.length > 1) {
      shared.push({ issue, toolNames: distinctTools });
    } else {
      const toolName = distinctTools[0];
      const list = uniqueByTool.get(toolName) ?? [];
      list.push(issue);
      uniqueByTool.set(toolName, list);
    }
  }

  shared.sort((a, b) => compareIssuesBySeverityThenId(a.issue, b.issue));
  for (const [toolName, issues] of uniqueByTool) {
    issues.sort(compareIssuesBySeverityThenId);
    uniqueByTool.set(toolName, issues);
  }

  return { shared, uniqueByTool };
}

function verdictForScore(score: number, criticalCount: number): AgentReadinessVerdict {
  if (criticalCount > 0 || score < 50) return 'not-ready';
  if (score < 70) return 'needs-work';
  if (score < 90) return 'agent-ready';
  return 'excellent';
}

function isReadyVerdict(verdict: AgentReadinessVerdict): boolean {
  return verdict === 'excellent' || verdict === 'agent-ready';
}

function appendGeneratedAt(lines: string[], generatedAt?: string): string[] {
  if (generatedAt) {
    lines.push(`**Generated:** ${generatedAt}`, '');
  }
  return lines;
}

export function toolReadinessMarkdown(
  tool: AgentReadinessToolReport,
  opts: ReadinessMarkdownOptions = {},
): string {
  const lines: string[] = [
    `# Agent Readiness — ${escapeInline(tool.toolName)}`,
    '',
    `**Server:** ${escapeInline(tool.serverName)}`,
    `**Score:** ${tool.score} / 100 — ${readinessLabel(tool.verdict)}`,
    issueSummaryLine(tool.issues),
    '',
    '## Issues',
    '',
  ];

  if (tool.issues.length === 0) {
    lines.push('_No readiness issues found._', '');
  } else {
    for (const issue of tool.issues) {
      lines.push(...issueBlock(issue, 3));
    }
  }

  appendGeneratedAt(lines, opts.generatedAt);
  return lines.join('\n');
}

export function serverReadinessMarkdown(
  serverName: string,
  tools: AgentReadinessToolReport[],
  quickWins: string[],
  opts: ReadinessMarkdownOptions = {},
): string {
  const sortedTools = [...tools].sort((a, b) => a.toolName.localeCompare(b.toolName));
  const allIssues = sortedTools.flatMap((tool) => tool.issues);
  const counts = countBySeverity(allIssues);
  const score =
    sortedTools.length === 0
      ? 0
      : Math.round(sortedTools.reduce((sum, tool) => sum + tool.score, 0) / sortedTools.length);
  const verdict = verdictForScore(score, counts.critical);
  const readyToolCount = sortedTools.filter((tool) => isReadyVerdict(tool.verdict)).length;

  const lines: string[] = [
    `# Agent Readiness — ${escapeInline(serverName)}`,
    '',
    `**Score:** ${score} / 100 — ${readinessLabel(verdict)}`,
    `**Tools scored:** ${sortedTools.length} · **Ready tools:** ${readyToolCount} · **Critical issues:** ${counts.critical} · **High issues:** ${counts.high}`,
    '',
  ];

  if (quickWins.length > 0) {
    lines.push('## Quick wins', '');
    for (const quickWin of quickWins) {
      lines.push(`- ${escapeInline(quickWin)}`);
    }
    lines.push('');
  }

  lines.push('## Tools', '', '| Tool | Score | Verdict | Critical | High | Medium | Low |', '| --- | --- | --- | --- | --- | --- | --- |');

  for (const tool of sortedTools) {
    const toolCounts = countBySeverity(tool.issues);
    lines.push(
      `| \`${escapeCell(tool.toolName)}\` | ${tool.score} | ${escapeCell(readinessLabel(tool.verdict))} | ${toolCounts.critical} | ${toolCounts.high} | ${toolCounts.medium} | ${toolCounts.low} |`,
    );
  }

  lines.push('');

  const { shared, uniqueByTool } = buildServerIssueGroups(sortedTools);

  if (shared.length > 0) {
    lines.push('## Shared findings', '');
    for (const { issue, toolNames } of shared) {
      lines.push(...sharedFindingLines(issue, toolNames));
    }
  }

  const toolsWithUniqueIssues = sortedTools.filter(
    (tool) => (uniqueByTool.get(tool.toolName)?.length ?? 0) > 0,
  );
  if (toolsWithUniqueIssues.length > 0) {
    lines.push('## Tool details', '');
    for (const tool of toolsWithUniqueIssues) {
      const uniqueIssues = uniqueByTool.get(tool.toolName) ?? [];
      lines.push(`### \`${escapeInline(tool.toolName)}\` — ${tool.score} · ${readinessLabel(tool.verdict)}`, '');
      for (const issue of uniqueIssues) {
        lines.push(...issueBlock(issue, 4));
      }
    }
  }

  appendGeneratedAt(lines, opts.generatedAt);
  return lines.join('\n');
}

/** Quick wins for one server's tool reports (same logic as the global readiness report). */
export function quickWinsForServerTools(tools: AgentReadinessToolReport[]): string[] {
  return quickWinsFor(tools.flatMap((tool) => tool.issues));
}
