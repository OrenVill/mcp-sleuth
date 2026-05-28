import type { ServerEntry, ServerStatus, ServerStdioConfig } from '../types';

function truncateStdioCommand(text: string, maxLen = 48): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function stdioCommandSummary(stdio: ServerStdioConfig | undefined): string {
  if (!stdio?.command) return 'stdio';
  return truncateStdioCommand([stdio.command, ...(stdio.args ?? [])].join(' '));
}

interface Props {
  servers: ServerEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onAddClick: () => void;
}

function ServerErrorMessage({ text }: { text: string }) {
  const parts = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const headline = parts[0] ?? text;
  const detail = parts.slice(1).join('\n\n');
  return (
    <div
      className="mt-1.5 rounded-md bg-red-950/35 border border-red-900/55 px-2 py-1.5 max-h-36 overflow-y-auto"
      role="alert"
    >
      <p className="text-xs text-red-300 font-medium leading-snug">⚠ {headline}</p>
      {detail ? (
        <p className="text-[11px] text-red-400/85 mt-1.5 leading-relaxed whitespace-pre-wrap">{detail}</p>
      ) : null}
    </div>
  );
}

const STATUS_CONFIG: Record<ServerStatus, { dot: string; ring: string; label: string }> = {
  disconnected: { dot: 'bg-zinc-600', ring: '', label: 'disconnected' },
  connecting: { dot: 'bg-amber-400', ring: 'ring-2 ring-amber-400/30 animate-pulse', label: 'connecting…' },
  connected: { dot: 'bg-emerald-400', ring: 'ring-2 ring-emerald-400/30', label: 'connected' },
  error: { dot: 'bg-red-500', ring: 'ring-2 ring-red-500/30', label: 'error' },
};

export function ServerList({
  servers,
  selectedId,
  onSelect,
  onConnect,
  onDisconnect,
  onEdit,
  onRemove,
  onAddClick,
}: Props) {
  return (
    <aside className="w-80 shrink-0 border-r border-zinc-800/80 flex flex-col h-full bg-zinc-950/40">
      <div className="px-4 py-3.5 border-b border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400">
            Servers
          </h2>
          <span className="text-[11px] text-zinc-600">{servers.length}</span>
        </div>
        <button
          type="button"
          onClick={onAddClick}
          className="text-xs px-2.5 py-1 rounded-md bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-medium shadow-sm shadow-violet-950/50 transition-colors flex items-center gap-1"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto py-1">
        {servers.length === 0 && (
          <li className="px-6 py-12 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-zinc-600" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm text-zinc-400 mb-1">No servers yet</p>
            <p className="text-xs text-zinc-600">
              Click <span className="text-violet-400 font-medium">+ Add</span> to register one.
            </p>
          </li>
        )}
        {servers.map((s) => {
          const isSelected = s.id === selectedId;
          const statusCfg = STATUS_CONFIG[s.status];
          const isStdio = s.transport === 'stdio';
          return (
            <li
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={[
                'group relative mx-1.5 my-0.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all',
                isSelected
                  ? 'bg-zinc-900/90 border border-zinc-700/70 shadow-md shadow-black/30'
                  : 'border border-transparent hover:bg-zinc-900/50 hover:border-zinc-800/80',
              ].join(' ')}
            >
              {isSelected && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-0.5 -translate-x-1.5 bg-gradient-to-b from-violet-500 to-fuchsia-600 rounded-full" />
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusCfg.dot} ${statusCfg.ring}`}
                    title={statusCfg.label}
                  />
                  <span className="font-medium text-sm text-zinc-100 truncate">
                    {s.name}
                  </span>
                  {isStdio && (
                    <span className="shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-sky-950/60 text-sky-300 border border-sky-800/50">
                      stdio
                    </span>
                  )}
                </div>
                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title="Edit"
                    className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(s.id);
                    }}
                  >
                    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
                      <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Remove"
                    className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/40"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(s.id);
                    }}
                  >
                    <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
                      <path d="M3 4h10M6 4V2.5h4V4M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="text-[11px] text-zinc-500 truncate mt-0.5 font-mono" title={isStdio ? stdioCommandSummary(s.stdio) : s.url}>
                {isStdio ? stdioCommandSummary(s.stdio) : s.url}
              </div>
              {s.description && (
                <div className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-snug">
                  {s.description}
                </div>
              )}
              {s.error && <ServerErrorMessage text={s.error} />}
              <div className="mt-2 flex gap-1.5 items-center">
                {s.status === 'connected' ? (
                  <button
                    type="button"
                    className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnect(s.id);
                    }}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={s.status === 'connecting'}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-700/90 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-wait text-white font-medium transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConnect(s.id);
                    }}
                  >
                    {s.status === 'connecting' ? 'Connecting…' : 'Connect'}
                  </button>
                )}
                {s.status === 'connected' && s.tools && (
                  <span className="text-[11px] text-zinc-500">
                    {s.tools.length} tool{s.tools.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
