import { useState } from 'react';
import { analyzeToolReadiness } from '../lib/agentReadiness';
import type { ProtocolTraceEvent } from '../lib/protocolTrace';
import type { DiscoveredTool, ServerEntry } from '../types';
import { AgentReadinessBadge } from './AgentReadinessBadge';

interface Props {
  tools: DiscoveredTool[];
  server: Pick<ServerEntry, 'id' | 'name'>;
  traces: ProtocolTraceEvent[];
  nativeNames: Set<string>;
  selectedToolName: string | null;
  onSelect: (name: string) => void;
}

export function DiscoveredToolsSection({ tools, server, traces, nativeNames, selectedToolName, onSelect }: Props) {
  const visible = tools.filter((t) => !nativeNames.has(t.name));
  const [open, setOpen] = useState(visible.length <= 50);
  if (visible.length === 0) return null;

  return (
    <li className="mt-2 border-t border-zinc-800/60 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2 flex items-center justify-between text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 hover:text-zinc-200"
      >
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="currentColor" aria-hidden>
            <path d="M5.5 3l5 5-5 5V3z" />
          </svg>
          Discovered
        </span>
        <span>{visible.length}</span>
      </button>
      {open && (
        <ul>
          {visible.map((t) => {
            const isSelected = t.name === selectedToolName;
            const desc = (t.description ?? '').split('\n').filter(Boolean)[0];
            const readiness = analyzeToolReadiness(t, server, traces);
            return (
              <li
                key={t.name}
                onClick={() => onSelect(t.name)}
                className={[
                  'group relative mx-1.5 my-0.5 px-3 py-2 rounded-lg cursor-pointer transition-all',
                  isSelected
                    ? 'bg-zinc-900/90 border border-zinc-700/70'
                    : 'border border-transparent hover:bg-zinc-900/50 hover:border-zinc-800/80',
                ].join(' ')}
              >
                {isSelected && (
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 -translate-x-1.5 bg-violet-500 rounded-full" />
                )}
                <div className="flex items-start justify-between gap-1">
                  <div className="font-mono text-xs text-zinc-100 truncate">{t.name}</div>
                  <AgentReadinessBadge score={readiness.score} verdict={readiness.verdict} compact />
                </div>
                {desc && (
                  <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 leading-snug">{desc}</div>
                )}
                <div className="text-[10px] text-zinc-600 mt-0.5 font-mono truncate">via {t.source.via}</div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
