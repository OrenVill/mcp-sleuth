import { useMemo, useState } from 'react';
import {
  highlightFinding,
  locationLabel,
  scanPromptInjection,
  type PromptInjectionFinding,
} from '../lib/promptInjectionScan';
import type { ServerEntry } from '../types';
import { HighlightedText } from './HighlightedText';

interface Props {
  servers: ServerEntry[];
}

const SELECT_CLASS =
  'mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm';

function severityClass(severity: PromptInjectionFinding['severity']): string {
  switch (severity) {
    case 'high':
      return 'border-red-900/70 bg-red-950/30';
    case 'medium':
      return 'border-amber-900/70 bg-amber-950/30';
    case 'low':
      return 'border-zinc-800 bg-zinc-900/40';
  }
}

function FindingCard({ finding }: { finding: PromptInjectionFinding }) {
  const parts = highlightFinding(finding.context, finding.matchedText);
  return (
    <div className={`rounded-xl border p-3 ${severityClass(finding.severity)}`}>
      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
        <span>{finding.severity}</span>
        <span>·</span>
        <span>{finding.patternLabel}</span>
        <span>·</span>
        <span>{locationLabel(finding.location)}</span>
        {finding.path ? (
          <>
            <span>·</span>
            <span className="font-mono">{finding.path}</span>
          </>
        ) : null}
      </div>
      <div className="font-mono text-sm text-zinc-100 mt-2">{finding.toolName}</div>
      <div className="mt-2 text-zinc-300">
        <HighlightedText parts={parts} />
      </div>
    </div>
  );
}

function EmptyState({ scannedToolCount }: { scannedToolCount: number }) {
  return (
    <div className="grid place-items-center text-center px-8 py-16">
      <p className="text-sm text-zinc-300">
        {scannedToolCount === 0
          ? 'Connect a server to scan tool metadata for prompt-injection patterns.'
          : 'No suspicious patterns found in tool metadata.'}
      </p>
      <p className="text-xs text-zinc-600 mt-1">
        Scans names, descriptions, and parameter text for override attempts and unusual Unicode.
      </p>
    </div>
  );
}

export function PromptInjectionPanel({ servers }: Props) {
  const report = useMemo(() => scanPromptInjection(servers), [servers]);
  const [serverFilter, setServerFilter] = useState<string | 'all'>('all');

  const serverIds = useMemo(
    () => [...new Set(report.findings.map((f) => f.serverId))],
    [report.findings],
  );

  const filtered = useMemo(() => {
    if (serverFilter === 'all') return report.findings;
    return report.findings.filter((f) => f.serverId === serverFilter);
  }, [report.findings, serverFilter]);

  if (report.scannedToolCount === 0) {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-zinc-950">
        <EmptyState scannedToolCount={0} />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-zinc-950">
      <div className="max-w-6xl mx-auto px-5 py-5 space-y-5">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-zinc-500">
            Prompt injection scan
          </div>
          <p className="text-sm text-zinc-400 mt-2">
            {report.findings.length === 0
              ? `Scanned ${report.scannedToolCount} tool(s) — no flags.`
              : `${report.findings.length} finding(s) across ${report.scannedToolCount} tool(s).`}
          </p>
        </section>

        {report.findings.length === 0 ? (
          <EmptyState scannedToolCount={report.scannedToolCount} />
        ) : (
          <>
            {serverIds.length > 1 && (
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
                  Filter by server
                </span>
                <select
                  value={serverFilter}
                  onChange={(e) => setServerFilter(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="all">All servers</option>
                  {serverIds.map((id) => {
                    const name = report.findings.find((f) => f.serverId === id)?.serverName ?? id;
                    return (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}

            <div className="space-y-2">
              {filtered.map((finding, index) => (
                <FindingCard
                  key={`${finding.serverId}:${finding.toolName}:${finding.patternId}:${finding.location}:${finding.path ?? index}`}
                  finding={finding}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
