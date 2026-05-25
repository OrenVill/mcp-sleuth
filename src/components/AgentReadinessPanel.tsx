import { useMemo, useState } from 'react';
import {
  analyzeAgentReadiness,
  readinessLabel,
  type AgentReadinessIssue,
  type AgentReadinessSeverity,
} from '../lib/agentReadiness';
import type { ServerEntry } from '../types';
import { AgentReadinessBadge } from './AgentReadinessBadge';
import { useProtocolTraces } from './useProtocolTraces';

interface Props {
  servers: ServerEntry[];
}

const SELECT_CLASS =
  'mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed';

function severityClass(severity: AgentReadinessSeverity): string {
  switch (severity) {
    case 'critical':
      return 'border-red-900/70 bg-red-950/30 text-red-200';
    case 'high':
      return 'border-orange-900/70 bg-orange-950/30 text-orange-200';
    case 'medium':
      return 'border-amber-900/70 bg-amber-950/30 text-amber-200';
    case 'low':
      return 'border-zinc-800 bg-zinc-900/40 text-zinc-300';
  }
}

function EmptyState() {
  return (
    <div className="grid place-items-center text-center px-8 py-16">
      <div className="max-w-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-zinc-600" aria-hidden>
            <path d="M5 7h14M5 12h10M5 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-sm text-zinc-300">Connect a server to score agent readiness.</p>
        <p className="text-xs text-zinc-600 mt-1">
          The report uses tool metadata, input schemas, and recent protocol traces.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
      <div className="text-sm text-zinc-100 font-mono mt-1">{value}</div>
    </div>
  );
}

function IssueCard({ issue }: { issue: AgentReadinessIssue }) {
  return (
    <div className={`rounded-xl border p-3 ${severityClass(issue.severity)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide opacity-80">
            {issue.severity}
            {issue.toolName ? ` / ${issue.toolName}` : ''}
            {issue.path ? ` / ${issue.path}` : ''}
          </div>
          <div className="text-sm mt-1">{issue.message}</div>
        </div>
        <code className="text-[10px] opacity-60">{issue.id}</code>
      </div>
      <div className="text-xs mt-2 opacity-80">{issue.recommendation}</div>
    </div>
  );
}

export function AgentReadinessPanel({ servers }: Props) {
  const traces = useProtocolTraces();
  const report = useMemo(() => analyzeAgentReadiness(servers, traces), [servers, traces]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const scoredServers = useMemo(
    () => Array.from(new Map(report.tools.map((tool) => [tool.serverId, tool.serverName])).entries()),
    [report.tools],
  );
  const activeServerId = scoredServers.some(([serverId]) => serverId === selectedServerId)
    ? selectedServerId
    : scoredServers[0]?.[0] ?? null;
  const activeServerTools = report.tools.filter((tool) => tool.serverId === activeServerId);
  const activeToolName = activeServerTools.some((tool) => tool.toolName === selectedToolName)
    ? selectedToolName
    : activeServerTools[0]?.toolName ?? null;
  const selectedTool = activeServerTools.find((tool) => tool.toolName === activeToolName) ?? null;

  if (report.toolCount === 0) {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-zinc-950">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-zinc-950">
      <div className="max-w-6xl mx-auto px-5 py-5 space-y-5">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-zinc-500">
                Agent Readiness
              </div>
              <h3 className="text-2xl font-semibold text-zinc-50 tracking-tight mt-1">
                {readinessLabel(report.verdict)}
              </h3>
              <p className="text-sm text-zinc-500 mt-2 max-w-2xl">
                Deterministic checks for whether connected MCP tools are easy for agents to discover,
                understand, call, and recover from without model-based analysis.
              </p>
            </div>
            <AgentReadinessBadge score={report.score} verdict={report.verdict} />
          </div>

          <div className="grid gap-3 sm:grid-cols-4 mt-5">
            <SummaryCard label="Tools scored" value={report.toolCount} />
            <SummaryCard label="Ready tools" value={report.readyToolCount} />
            <SummaryCard label="Critical issues" value={report.criticalCount} />
            <SummaryCard label="High issues" value={report.highCount} />
          </div>
        </section>

        {report.quickWins.length > 0 && (
          <section className="rounded-xl border border-violet-900/50 bg-violet-950/20 p-4">
            <h4 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-violet-300">
              Quick wins
            </h4>
            <ul className="mt-3 space-y-2">
              {report.quickWins.map((quickWin) => (
                <li key={quickWin} className="text-sm text-zinc-300">
                  {quickWin}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h4 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
                Inspect tool issues
              </h4>
              <p className="text-xs text-zinc-600 mt-1">
                Choose a server and tool to see the exact readiness issues and recommended fixes.
              </p>
            </div>
            {selectedTool && (
              <AgentReadinessBadge score={selectedTool.score} verdict={selectedTool.verdict} />
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 mb-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
                Server
              </span>
              <select
                value={activeServerId ?? ''}
                onChange={(event) => {
                  const nextServerId = event.target.value;
                  const firstTool = report.tools.find((tool) => tool.serverId === nextServerId);
                  setSelectedServerId(nextServerId);
                  setSelectedToolName(firstTool?.toolName ?? null);
                }}
                className={SELECT_CLASS}
              >
                {scoredServers.map(([serverId, serverName]) => (
                  <option key={serverId} value={serverId}>
                    {serverName}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
                Tool
              </span>
              <select
                value={activeToolName ?? ''}
                onChange={(event) => setSelectedToolName(event.target.value)}
                className={`${SELECT_CLASS} font-mono`}
              >
                {activeServerTools.map((tool) => (
                  <option key={tool.toolName} value={tool.toolName}>
                    {tool.toolName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedTool && (
            <div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 mb-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm text-zinc-100 truncate">{selectedTool.toolName}</div>
                  <div className="text-[11px] text-zinc-600 truncate">{selectedTool.serverName}</div>
                </div>
                <div className="text-xs text-zinc-500">
                  {selectedTool.issues.length === 0
                    ? 'No issues'
                    : `${selectedTool.issues.length} issue${selectedTool.issues.length === 1 ? '' : 's'}`}
                </div>
              </div>

              {selectedTool.issues.length === 0 ? (
                <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm text-emerald-200">
                  No readiness issues found for this tool.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedTool.issues.map((issue, index) => (
                    <IssueCard
                      key={`${issue.serverId}:${issue.toolName}:${issue.id}:${issue.path ?? index}`}
                      issue={issue}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
