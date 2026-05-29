import { useCallback, useMemo, useRef, useState } from 'react';
import {
  addInvocationObservation,
  decisionLabel,
  exportJournalMarkdown,
  setGeneralNotes,
  setTrustDecision,
  upsertToolAnnotation,
  type TrustDecision,
} from '../lib/observationJournal';
import {
  getObservationJournal,
  updateObservationJournal,
} from '../lib/observationJournalStore';
import { getAllTools, getConnectedServers } from '../lib/serverTools';
import type { ServerEntry } from '../types';

interface Props {
  servers: ServerEntry[];
  selectedServerId: string | null;
  selectedToolName: string | null;
}

const SELECT_CLASS =
  'mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm';

const TEXTAREA_CLASS =
  'mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm min-h-[80px]';

function ToolAnnotationForm({
  initialNote,
  initialFlagged,
  onSave,
}: {
  initialNote: string;
  initialFlagged: boolean;
  onSave: (note: string, flagged: boolean) => void;
}) {
  const [note, setNote] = useState(initialNote);
  const [flagged, setFlagged] = useState(initialFlagged);

  return (
    <div className="space-y-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className={TEXTAREA_CLASS}
        placeholder="Notes about this tool…"
      />
      <label className="flex items-center gap-2 text-sm text-zinc-400">
        <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />
        Flag concern
      </label>
      <button
        type="button"
        onClick={() => onSave(note, flagged)}
        className="px-3 py-2 text-xs rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
      >
        Save tool note
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center text-center px-8 py-16">
      <p className="text-sm text-zinc-300">Connect a server to start an observation journal.</p>
      <p className="text-xs text-zinc-600 mt-1">
        Document trust decisions, tool notes, and manual invocation observations. Persisted locally.
      </p>
    </div>
  );
}

export function ObservationJournalPanel({
  servers,
  selectedServerId,
  selectedToolName,
}: Props) {
  const connected = useMemo(() => getConnectedServers(servers), [servers]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const serverId =
    connected.some((s) => s.id === activeServerId)
      ? activeServerId
      : connected.some((s) => s.id === selectedServerId)
        ? selectedServerId
        : connected[0]?.id ?? null;

  const server = connected.find((s) => s.id === serverId) ?? null;

  const journal = useMemo(() => {
    if (!server) return null;
    return getObservationJournal(server);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision bumps reload from store
  }, [server, revision]);

  const tools = useMemo(() => (server ? getAllTools(server) : []), [server]);

  const [pickedTool, setPickedTool] = useState<string | null>(null);
  const [invocationNote, setInvocationNote] = useState('');
  const [invocationFlagged, setInvocationFlagged] = useState(false);
  const decisionReasonRef = useRef<HTMLTextAreaElement>(null);

  const activeToolName =
    tools.some((t) => t.name === pickedTool)
      ? pickedTool!
      : tools.some((t) => t.name === selectedToolName)
        ? selectedToolName!
        : tools[0]?.name ?? '';

  const activeAnnotation = journal?.toolAnnotations.find((a) => a.toolName === activeToolName);

  const persist = useCallback(
    (updater: Parameters<typeof updateObservationJournal>[1]) => {
      if (!server) return;
      updateObservationJournal(server, updater);
      setRevision((r) => r + 1);
    },
    [server],
  );

  const exportMarkdown = useCallback(() => {
    if (!journal) return;
    const md = exportJournalMarkdown(journal);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `observation-journal-${journal.serverName.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [journal]);

  const copyMarkdown = useCallback(async () => {
    if (!journal) return;
    await navigator.clipboard.writeText(exportJournalMarkdown(journal));
  }, [journal]);

  if (connected.length === 0) {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-zinc-950">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-zinc-950">
      <div className="max-w-6xl mx-auto px-5 py-5 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[200px]">
            <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
              Server
            </span>
            <select
              value={serverId ?? ''}
              onChange={(e) => setActiveServerId(e.target.value)}
              className={SELECT_CLASS}
            >
              {connected.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void copyMarkdown()}
              className="px-3 py-2 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Copy report
            </button>
            <button
              type="button"
              onClick={exportMarkdown}
              className="px-3 py-2 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-500"
            >
              Export markdown
            </button>
          </div>
        </div>

        {journal && (
          <>
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
              <h4 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
                Trust decision
              </h4>
              <p className="text-xs text-zinc-600">
                Current: <span className="text-zinc-300">{decisionLabel(journal.decision)}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {(['approved', 'needs_review', 'rejected'] as const).map((decision) => (
                  <button
                    key={decision}
                    type="button"
                    onClick={() => {
                      const reason = decisionReasonRef.current?.value ?? '';
                      persist((j) => setTrustDecision(j, decision, reason));
                    }}
                    className={[
                      'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                      journal.decision === decision
                        ? 'border-violet-500 bg-violet-950/40 text-violet-100'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
                    ].join(' ')}
                  >
                    {decisionLabel(decision)}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="text-[11px] text-zinc-500">Reason</span>
                <textarea
                  ref={decisionReasonRef}
                  key={`${journal.serverId}-${journal.decisionUpdatedAt ?? 0}-reason`}
                  defaultValue={journal.decisionReason ?? ''}
                  onBlur={() => {
                    if (journal.decision === 'unset') return;
                    const reason = decisionReasonRef.current?.value ?? '';
                    persist((j) =>
                      setTrustDecision(
                        j,
                        j.decision as Exclude<TrustDecision, 'unset'>,
                        reason,
                      ),
                    );
                  }}
                  className={TEXTAREA_CLASS}
                  placeholder="Why this trust decision?"
                />
              </label>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h4 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500 mb-2">
                General notes
              </h4>
              <textarea
                defaultValue={journal.generalNotes}
                key={`${journal.serverId}-${journal.updatedAt}-general`}
                onBlur={(e) => persist((j) => setGeneralNotes(j, e.target.value))}
                className={TEXTAREA_CLASS}
                placeholder="Overall observations about this server…"
              />
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
              <h4 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
                Tool annotation
              </h4>
              <select
                value={activeToolName}
                onChange={(e) => setPickedTool(e.target.value)}
                className={`${SELECT_CLASS} font-mono`}
              >
                {tools.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
              {activeToolName && (
                <ToolAnnotationForm
                  key={`${journal.serverId}-${activeToolName}-${revision}`}
                  initialNote={activeAnnotation?.note ?? ''}
                  initialFlagged={activeAnnotation?.flagged ?? false}
                  onSave={(note, flagged) => {
                    persist((j) =>
                      upsertToolAnnotation(j, activeToolName, { note, flagged }),
                    );
                  }}
                />
              )}
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
              <h4 className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
                Log invocation observation
              </h4>
              <textarea
                value={invocationNote}
                onChange={(e) => setInvocationNote(e.target.value)}
                className={TEXTAREA_CLASS}
                placeholder="What happened when you invoked the tool?"
              />
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={invocationFlagged}
                  onChange={(e) => setInvocationFlagged(e.target.checked)}
                />
                Flag concern
              </label>
              <button
                type="button"
                disabled={!activeToolName || !invocationNote.trim()}
                onClick={() => {
                  persist((j) => {
                    const next = addInvocationObservation(j, {
                      toolName: activeToolName,
                      note: invocationNote.trim(),
                      flagged: invocationFlagged,
                    });
                    return next;
                  });
                  setInvocationNote('');
                  setInvocationFlagged(false);
                }}
                className="px-3 py-2 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50"
              >
                Add observation
              </button>

              {journal.invocationObservations.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-zinc-800 pt-3">
                  {journal.invocationObservations.slice(0, 20).map((obs) => (
                    <li
                      key={obs.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs"
                    >
                      <div className="flex justify-between gap-2 text-zinc-500">
                        <span className="font-mono text-zinc-300">{obs.toolName}</span>
                        <time dateTime={new Date(obs.timestamp).toISOString()}>
                          {new Date(obs.timestamp).toLocaleString()}
                        </time>
                      </div>
                      <p className="text-zinc-300 mt-1">{obs.note}</p>
                      {obs.flagged && (
                        <span className="text-amber-400 mt-1 inline-block">Flagged</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
