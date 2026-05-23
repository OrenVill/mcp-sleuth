import { useState } from 'react';
import type { CallRecord } from '../lib/history';
import { ResultPane } from './ResultPane';
import { CodeBlock } from './CodeBlock';

interface Props {
  history: CallRecord[];
  onReplay: (args: Record<string, unknown>) => void;
  onClear: () => void;
}

function relativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Line-level diff: highlights lines that differ between two strings. */
function diffLines(a: string, b: string) {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const bSet = new Set(bLines);
  const aSet = new Set(aLines);
  return {
    left: aLines.map((line) => ({ line, changed: !bSet.has(line) })),
    right: bLines.map((line) => ({ line, changed: !aSet.has(line) })),
  };
}

function DiffBlock({ lines }: { lines: { line: string; changed: boolean }[] }) {
  return (
    <pre className="text-xs font-mono leading-5 overflow-x-auto whitespace-pre p-3">
      {lines.map((l, i) => (
        <div
          key={i}
          className={l.changed ? 'bg-amber-900/30 text-amber-200' : 'text-zinc-300'}
        >
          {l.line}
        </div>
      ))}
    </pre>
  );
}

// ---------- Semantic JSON diff ----------

type DiffStatus = 'added' | 'removed' | 'changed';

interface SemanticEntry {
  path: string;
  left: unknown;
  right: unknown;
  status: DiffStatus;
}

function collectDiffs(a: unknown, b: unknown, path: string, out: SemanticEntry[]): void {
  if (JSON.stringify(a) === JSON.stringify(b)) return;

  const aIsObj = a !== null && typeof a === 'object' && !Array.isArray(a);
  const bIsObj = b !== null && typeof b === 'object' && !Array.isArray(b);

  if (aIsObj && bIsObj) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in aObj)) {
        out.push({ path: childPath, left: undefined, right: bObj[key], status: 'added' });
      } else if (!(key in bObj)) {
        out.push({ path: childPath, left: aObj[key], right: undefined, status: 'removed' });
      } else {
        collectDiffs(aObj[key], bObj[key], childPath, out);
      }
    }
    return;
  }

  out.push({ path: path || '(root)', left: a, right: b, status: 'changed' });
}

function semanticDiff(a: Record<string, unknown>, b: Record<string, unknown>): SemanticEntry[] {
  const out: SemanticEntry[] = [];
  collectDiffs(a, b, '', out);
  return out;
}

function formatVal(v: unknown): string {
  if (v === undefined) return '—';
  if (typeof v === 'string') return `"${v}"`;
  return JSON.stringify(v);
}

function SemanticDiffView({ entries }: { entries: SemanticEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-emerald-400 px-3 py-2">Identical</p>;
  }
  return (
    <div className="divide-y divide-zinc-800/60 text-xs font-mono">
      {entries.map((e, i) => (
        <div key={i} className="px-3 py-2 grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
          <div className={e.status === 'removed' ? 'text-red-300' : e.status === 'added' ? 'text-zinc-500' : 'text-red-300'}>
            {e.status !== 'added' ? formatVal(e.left) : <span className="text-zinc-600">—</span>}
          </div>
          <div className="text-zinc-600 text-[10px] pt-0.5 whitespace-nowrap">
            {e.status === 'added' ? '+ ' : e.status === 'removed' ? '− ' : '→ '}
            <span className="text-zinc-500">{e.path}</span>
          </div>
          <div className={e.status === 'added' ? 'text-emerald-300' : e.status === 'removed' ? 'text-zinc-500' : 'text-emerald-300'}>
            {e.status !== 'removed' ? formatVal(e.right) : <span className="text-zinc-600">—</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
    >
      {copied ? 'Copied!' : 'copy'}
    </button>
  );
}

/** Expanded detail for a single call record. */
function RecordDetail({ record, onReplay }: { record: CallRecord; onReplay: () => void }) {
  const argsJson = JSON.stringify(record.args, null, 2);
  return (
    <div className="px-4 pb-4 space-y-3 border-t border-zinc-800/60 pt-3">
      <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 overflow-hidden">
        <div className="px-3 py-1.5 border-b border-zinc-800/60 flex items-center justify-between bg-zinc-950/40">
          <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">Args</span>
          <CopyButton text={argsJson} />
        </div>
        <CodeBlock code={argsJson} lang="json" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-2">Result</div>
        {record.result ? (
          <ResultPane result={record.result} error={null} loading={false} />
        ) : (
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 text-xs text-zinc-500 italic">
            No result captured.
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onReplay}
        className="text-xs px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-800/50 transition-colors"
      >
        ↺ Replay with these args
      </button>
    </div>
  );
}

/** Side-by-side comparison of two call records. */
function CompareView({
  a,
  b,
  onReplay,
  onClose,
}: {
  a: CallRecord;
  b: CallRecord;
  onReplay: (args: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const aArgs = JSON.stringify(a.args, null, 2);
  const bArgs = JSON.stringify(b.args, null, 2);
  const argsDiff = diffLines(aArgs, bArgs);
  const argsIdentical = aArgs === bArgs;

  // Try semantic JSON diff first
  let semanticEntries: SemanticEntry[] | null = null;
  try {
    const aObj = JSON.parse(aArgs) as Record<string, unknown>;
    const bObj = JSON.parse(bArgs) as Record<string, unknown>;
    semanticEntries = semanticDiff(aObj, bObj);
  } catch {
    // fall through to line diff
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400">
          Comparing 2 calls
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ✕ Close
        </button>
      </div>

      {/* Headers */}
      <div className="grid grid-cols-2 gap-3">
        {[a, b].map((rec, idx) => (
          <div
            key={rec.id}
            className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 flex flex-col gap-1"
          >
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${rec.result?.isError ? 'bg-red-400' : rec.result ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              <span className="text-[11px] text-zinc-300 font-semibold">Call {idx + 1}</span>
            </div>
            <span className="text-[10px] text-zinc-500">{formatDate(rec.timestamp)}</span>
            {rec.durationMs !== undefined && (
              <span className="text-[10px] text-zinc-600 font-mono">{rec.durationMs}ms</span>
            )}
            <button
              type="button"
              onClick={() => onReplay(rec.args)}
              className="mt-1 text-[10px] px-2 py-1 rounded bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-800/50 transition-colors self-start"
            >
              ↺ Replay
            </button>
          </div>
        ))}
      </div>

      {/* Args diff */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-2 flex items-center gap-2">
          Args
          {argsIdentical && (
            <span className="text-emerald-500 normal-case tracking-normal">identical</span>
          )}
        </div>
        {!argsIdentical && semanticEntries !== null ? (
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 overflow-hidden">
            <SemanticDiffView entries={semanticEntries} />
          </div>
        ) : !argsIdentical ? (
          <div className="grid grid-cols-2 gap-3">
            {([argsDiff.left, argsDiff.right] as { line: string; changed: boolean }[][]).map(
              (lines, idx) => (
                <div key={idx} className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 overflow-hidden">
                  <div className="px-3 py-1 border-b border-zinc-800/60 bg-zinc-950/40 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">Call {idx + 1}</span>
                    <CopyButton text={idx === 0 ? aArgs : bArgs} />
                  </div>
                  <DiffBlock lines={lines} />
                </div>
              ),
            )}
          </div>
        ) : null}
      </div>

      {/* Results */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold mb-2">Result</div>
        <div className="grid grid-cols-2 gap-3">
          {[a, b].map((rec, idx) => (
            <div key={idx}>
              {rec.result ? (
                <ResultPane result={rec.result} error={null} loading={false} />
              ) : (
                <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 text-xs text-zinc-500 italic">
                  No result.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CallHistory({ history, onReplay, onClear }: Props) {
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);

  if (history.length === 0) return null;

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  }

  function startCompare() {
    const ids = Array.from(selectedIds);
    if (ids.length === 2) setCompareIds([ids[0], ids[1]]);
  }

  const compareA = compareIds ? history.find((r) => r.id === compareIds[0]) : undefined;
  const compareB = compareIds ? history.find((r) => r.id === compareIds[1]) : undefined;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 group-hover:text-zinc-300 transition-colors">
          Call History
        </h2>
        <span className="text-[10px] text-zinc-600 font-mono">{history.length}</span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className={`w-3 h-3 text-zinc-600 ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
          {/* Compare toolbar */}
          {selectedIds.size > 0 && (
            <div className="px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/60 flex items-center gap-3">
              <span className="text-[11px] text-zinc-400">
                {selectedIds.size === 2 ? '2 calls selected' : '1 of 2 selected — pick one more'}
              </span>
              {selectedIds.size === 2 && (
                <button
                  type="button"
                  onClick={startCompare}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-800/50 transition-colors"
                >
                  Compare
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors ml-auto"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Compare view */}
          {compareIds && compareA && compareB ? (
            <div className="p-4">
              <CompareView
                a={compareA}
                b={compareB}
                onReplay={(args) => { onReplay(args); setCompareIds(null); setSelectedIds(new Set()); }}
                onClose={() => { setCompareIds(null); setSelectedIds(new Set()); }}
              />
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {history.map((record) => {
                const isExpanded = expandedId === record.id;
                const isSelected = selectedIds.has(record.id);
                return (
                  <li key={record.id}>
                    {/* Row */}
                    <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/30 transition-colors group">
                      {/* Checkbox for compare */}
                      <button
                        type="button"
                        onClick={() => toggleSelect(record.id)}
                        title="Select for comparison"
                        className={[
                          'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                          isSelected
                            ? 'border-violet-500 bg-violet-600/30 text-violet-300'
                            : 'border-zinc-700 text-transparent hover:border-zinc-500 group-hover:border-zinc-600',
                          selectedIds.size >= 2 && !isSelected ? 'opacity-30 cursor-not-allowed' : '',
                        ].join(' ')}
                        disabled={selectedIds.size >= 2 && !isSelected}
                      >
                        {isSelected && (
                          <svg viewBox="0 0 10 10" fill="currentColor" className="w-2.5 h-2.5" aria-hidden>
                            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          </svg>
                        )}
                      </button>

                      {/* Status dot */}
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          record.result?.isError ? 'bg-red-400' : record.result ? 'bg-emerald-400' : 'bg-zinc-600'
                        }`}
                      />

                      {/* Main row content — click to expand */}
                      <button
                        type="button"
                        onClick={() => toggleExpand(record.id)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        <span className="text-xs text-zinc-300 truncate flex-1">{relativeTime(record.timestamp)}</span>
                        {record.durationMs !== undefined && (
                          <span className="text-[10px] text-zinc-600 flex-shrink-0 font-mono">
                            {record.durationMs}ms
                          </span>
                        )}
                        {/* Expand chevron */}
                        <svg
                          viewBox="0 0 16 16"
                          fill="none"
                          className={`w-3 h-3 text-zinc-600 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          aria-hidden
                        >
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <RecordDetail
                        record={record}
                        onReplay={() => onReplay(record.args)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-4 py-2 border-t border-zinc-800/60 flex justify-end">
            <button
              type="button"
              onClick={() => { onClear(); setSelectedIds(new Set()); setExpandedId(null); setCompareIds(null); }}
              className="text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Clear history
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
