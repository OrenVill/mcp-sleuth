import { useState } from 'react';
import type { ServerEntry, ToolDef } from '../types';
import { DiscoveredToolsSection } from './DiscoveredToolsSection';
import { loadBookmarks, toggleBookmark } from '../lib/bookmarks';

interface Props {
  server: ServerEntry | null;
  selectedToolName: string | null;
  onSelect: (toolName: string) => void;
  embedded?: boolean;
}

export function ToolList({ server, selectedToolName, onSelect, embedded = false }: Props) {
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => loadBookmarks());

  function handleToggleBookmark(e: React.MouseEvent, serverId: string, toolName: string) {
    e.stopPropagation();
    const newState = toggleBookmark(serverId, toolName);
    setBookmarks((prev) => {
      const next = new Set(prev);
      const key = `${serverId}::${toolName}`;
      if (newState) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  if (!server) {
    if (embedded) return null;
    return (
      <div className="w-72 shrink-0 border-r border-zinc-800/80 p-6 text-sm text-zinc-500 bg-zinc-950/20">
        <div className="text-zinc-600 text-xs uppercase tracking-wider mb-2">Tools</div>
        Select a server from the left.
      </div>
    );
  }

  if (server.status !== 'connected') {
    if (embedded) return null;
    return (
      <div className="w-72 shrink-0 border-r border-zinc-800/80 p-6 text-sm bg-zinc-950/20">
        <div className="text-zinc-600 text-xs uppercase tracking-wider mb-2">Tools</div>
        <p className="text-zinc-400">
          Connect to <span className="text-zinc-200 font-medium">{server.name}</span> to discover tools.
        </p>
      </div>
    );
  }

  const tools = server.tools ?? [];
  const serverId = server.id;

  const listContent = (
    <>
      {tools.length === 0 && (
        <li className="px-4 py-6 text-sm text-zinc-500 text-center">
          No tools advertised.
        </li>
      )}
      {tools.map((t: ToolDef) => {
        const isSelected = t.name === selectedToolName;
        const bookmarkKey = `${serverId}::${t.name}`;
        const starred = bookmarks.has(bookmarkKey);
        const desc = stripEmoji(t.description ?? '').split('\n').filter(Boolean)[0];
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
              <div className="font-mono text-xs text-zinc-100 truncate flex-1">{t.name}</div>
              <button
                type="button"
                title={starred ? 'Remove bookmark' : 'Bookmark this tool'}
                onClick={(e) => handleToggleBookmark(e, serverId, t.name)}
                className={[
                  'shrink-0 text-sm leading-none transition-all rounded p-0.5',
                  starred
                    ? 'text-amber-400 opacity-100'
                    : 'text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-amber-300',
                ].join(' ')}
              >
                {starred ? '★' : '☆'}
              </button>
            </div>
            {desc && (
              <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 leading-snug">
                {desc}
              </div>
            )}
          </li>
        );
      })}
      <DiscoveredToolsSection
        tools={server.discovered ?? []}
        nativeNames={new Set(tools.map((t) => t.name))}
        selectedToolName={selectedToolName}
        onSelect={onSelect}
      />
    </>
  );

  if (embedded) {
    return <ul className="py-1">{listContent}</ul>;
  }

  return (
    <aside className="w-72 shrink-0 border-r border-zinc-800/80 flex flex-col h-full bg-zinc-950/20">
      <div className="px-4 py-3.5 border-b border-zinc-800/80 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400">
          Tools
        </h2>
        <span className="text-[11px] text-zinc-600">{tools.length}</span>
      </div>
      <ul className="flex-1 overflow-y-auto py-1">{listContent}</ul>
    </aside>
  );
}

function stripEmoji(s: string): string {
  return s.replace(/^[^\w(]*\s*/, '');
}
