import { useMemo, useState } from 'react';
import {
  auditPermissionSurface,
  categoryLabel,
  type PermissionCategory,
  type ServerPermissionSurface,
} from '../lib/permissionSurfaceAudit';
import type { ServerEntry } from '../types';

interface Props {
  servers: ServerEntry[];
}

const SELECT_CLASS =
  'mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed';

const CATEGORY_COLORS: Record<PermissionCategory, string> = {
  filesystem: 'border-sky-900/60 bg-sky-950/30 text-sky-200',
  network: 'border-indigo-900/60 bg-indigo-950/30 text-indigo-200',
  shell: 'border-red-900/60 bg-red-950/30 text-red-200',
  data_read: 'border-zinc-700 bg-zinc-900/50 text-zinc-300',
  data_write: 'border-amber-900/60 bg-amber-950/30 text-amber-200',
  destructive: 'border-orange-900/70 bg-orange-950/30 text-orange-200',
  admin: 'border-violet-900/60 bg-violet-950/30 text-violet-200',
  credential: 'border-rose-900/60 bg-rose-950/30 text-rose-200',
};

function EmptyState() {
  return (
    <div className="grid place-items-center text-center px-8 py-16">
      <p className="text-sm text-zinc-300">Connect a server to audit its permission surface.</p>
      <p className="text-xs text-zinc-600 mt-1">
        Inferred from tool names, parameter names, types, and descriptions — not a pass/fail score.
      </p>
    </div>
  );
}

function CategoryChip({ category, count }: { category: PermissionCategory; count: number }) {
  if (count === 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide ${CATEGORY_COLORS[category]}`}
    >
      {categoryLabel(category)}
      <span className="opacity-70">×{count}</span>
    </span>
  );
}

function ServerSummary({ surface }: { surface: ServerPermissionSurface }) {
  const activeCategories = (
    Object.entries(surface.categoryCounts) as Array<[PermissionCategory, number]>
  ).filter(([, count]) => count > 0);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-zinc-500">
          Risk surface summary
        </div>
        <h3 className="text-lg font-semibold text-zinc-50 mt-1">{surface.serverName}</h3>
        <p className="text-sm text-zinc-400 mt-2">{surface.riskSummary}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {activeCategories.length === 0 ? (
          <span className="text-xs text-zinc-500">No category signals detected</span>
        ) : (
          activeCategories.map(([category, count]) => (
            <CategoryChip key={category} category={category} count={count} />
          ))
        )}
      </div>
      <div className="text-xs text-zinc-600">
        {surface.toolCount} tool{surface.toolCount === 1 ? '' : 's'} analyzed
      </div>
    </section>
  );
}

export function PermissionSurfacePanel({ servers }: Props) {
  const report = useMemo(() => auditPermissionSurface(servers), [servers]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const activeServerId = report.servers.some((s) => s.serverId === selectedServerId)
    ? selectedServerId
    : report.servers[0]?.serverId ?? null;
  const surface = report.servers.find((s) => s.serverId === activeServerId) ?? null;

  if (report.servers.length === 0) {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-zinc-950">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-zinc-950">
      <div className="max-w-6xl mx-auto px-5 py-5 space-y-5">
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
            Server
          </span>
          <select
            value={activeServerId ?? ''}
            onChange={(e) => {
              setSelectedServerId(e.target.value);
              setExpandedTool(null);
            }}
            className={SELECT_CLASS}
          >
            {report.servers.map((s) => (
              <option key={s.serverId} value={s.serverId}>
                {s.serverName}
              </option>
            ))}
          </select>
        </label>

        {surface && <ServerSummary surface={surface} />}

        {surface && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h4 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500 mb-3">
              Per-tool signals
            </h4>
            <div className="space-y-2">
              {surface.tools.map((tool) => (
                <div key={tool.toolName} className="rounded-lg border border-zinc-800 bg-zinc-950/50">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
                    onClick={() =>
                      setExpandedTool(expandedTool === tool.toolName ? null : tool.toolName)
                    }
                  >
                    <span className="font-mono text-sm text-zinc-100">{tool.toolName}</span>
                    <span className="text-[10px] text-zinc-500">
                      {tool.categories.length === 0
                        ? 'no signals'
                        : tool.categories.map(categoryLabel).join(', ')}
                    </span>
                  </button>
                  {expandedTool === tool.toolName && tool.signals.length > 0 && (
                    <ul className="border-t border-zinc-800 px-3 py-2 space-y-1.5">
                      {tool.signals.map((signal, i) => (
                        <li key={i} className="text-xs text-zinc-400">
                          <span className={`rounded border px-1 py-0.5 mr-2 ${CATEGORY_COLORS[signal.category]}`}>
                            {categoryLabel(signal.category)}
                          </span>
                          <span className="text-zinc-600">{signal.source}</span>
                          {signal.path ? (
                            <span className="text-zinc-600"> · {signal.path}</span>
                          ) : null}
                          <span className="text-zinc-500"> — {signal.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
