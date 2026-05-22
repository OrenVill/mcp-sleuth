import { useEffect, useRef, useState } from 'react';
import type { ServerEntry } from '../types';
import { loadBookmarks } from '../lib/bookmarks';

interface SearchResult {
  serverId: string;
  serverName: string;
  type: 'Tool' | 'Resource' | 'Prompt';
  name: string;
  /** For resources, this is the URI / uriTemplate used to select the item */
  uri?: string;
  description?: string;
  bookmarked: boolean;
}

interface Props {
  servers: ServerEntry[];
  onSelectTool: (serverId: string, toolName: string) => void;
  onSelectResource: (serverId: string, uri: string) => void;
  onSelectPrompt: (serverId: string, name: string) => void;
}

function buildResults(servers: ServerEntry[], query: string, bookmarks: Set<string>): SearchResult[] {
  const q = query.toLowerCase().trim();
  const results: SearchResult[] = [];

  for (const server of servers) {
    if (server.status !== 'connected') continue;

    // Native tools
    for (const tool of server.tools ?? []) {
      if (!q || tool.name.toLowerCase().includes(q) || (tool.description ?? '').toLowerCase().includes(q)) {
        const key = `${server.id}::${tool.name}`;
        results.push({
          serverId: server.id,
          serverName: server.name,
          type: 'Tool',
          name: tool.name,
          description: tool.description,
          bookmarked: bookmarks.has(key),
        });
      }
    }

    // Discovered tools
    for (const tool of server.discovered ?? []) {
      // Skip if already in native tools (avoid duplicates)
      if (server.tools?.some((t) => t.name === tool.name)) continue;
      if (!q || tool.name.toLowerCase().includes(q) || (tool.description ?? '').toLowerCase().includes(q)) {
        const key = `${server.id}::${tool.name}`;
        results.push({
          serverId: server.id,
          serverName: server.name,
          type: 'Tool',
          name: tool.name,
          description: tool.description,
          bookmarked: bookmarks.has(key),
        });
      }
    }

    // Resources
    for (const res of server.resources ?? []) {
      if (!q || res.name.toLowerCase().includes(q) || res.uri.toLowerCase().includes(q) || (res.description ?? '').toLowerCase().includes(q)) {
        results.push({
          serverId: server.id,
          serverName: server.name,
          type: 'Resource',
          name: res.name,
          uri: res.uri,
          description: res.description ?? res.uri,
          bookmarked: false,
        });
      }
    }

    // Resource templates
    for (const tpl of server.resourceTemplates ?? []) {
      if (!q || tpl.name.toLowerCase().includes(q) || tpl.uriTemplate.toLowerCase().includes(q) || (tpl.description ?? '').toLowerCase().includes(q)) {
        results.push({
          serverId: server.id,
          serverName: server.name,
          type: 'Resource',
          name: tpl.name,
          uri: tpl.uriTemplate,
          description: tpl.description ?? tpl.uriTemplate,
          bookmarked: false,
        });
      }
    }

    // Prompts
    for (const prompt of server.prompts ?? []) {
      if (!q || prompt.name.toLowerCase().includes(q) || (prompt.description ?? '').toLowerCase().includes(q)) {
        results.push({
          serverId: server.id,
          serverName: server.name,
          type: 'Prompt',
          name: prompt.name,
          description: prompt.description,
          bookmarked: false,
        });
      }
    }
  }

  // Sort: bookmarked items first, then by type priority, then alphabetically
  return results.sort((a, b) => {
    if (a.bookmarked !== b.bookmarked) return a.bookmarked ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

const TYPE_BADGE_CLASSES: Record<string, string> = {
  Tool: 'bg-violet-900/60 text-violet-300 border border-violet-700/50',
  Resource: 'bg-blue-900/60 text-blue-300 border border-blue-700/50',
  Prompt: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50',
};

export function GlobalSearch({ servers, onSelectTool, onSelectResource, onSelectPrompt }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const bookmarks = loadBookmarks();
  const results = buildResults(servers, query, bookmarks);

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) {
            setQuery('');
            setActiveIndex(0);
          }
          return !prev;
        });
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Auto-focus input when modal opens (DOM operation, not setState)
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && results[activeIndex]) {
      handleSelect(results[activeIndex]);
    }
  }

  function handleSelect(result: SearchResult) {
    setOpen(false);
    if (result.type === 'Tool') {
      onSelectTool(result.serverId, result.name);
    } else if (result.type === 'Resource') {
      onSelectResource(result.serverId, result.uri ?? result.name);
    } else if (result.type === 'Prompt') {
      onSelectPrompt(result.serverId, result.name);
    }
  }

  if (!open) return null;

  // Group results by server for display
  type GroupedEntry = { serverName: string; items: (SearchResult & { originalIndex: number })[] };
  const groups: GroupedEntry[] = [];
  const serverOrder: string[] = [];
  const serverGroups = new Map<string, GroupedEntry>();

  results.forEach((r, idx) => {
    const groupKey = r.serverId;
    if (!serverGroups.has(groupKey)) {
      const g: GroupedEntry = { serverName: r.serverName, items: [] };
      serverGroups.set(groupKey, g);
      serverOrder.push(groupKey);
      groups.push(g);
    }
    serverGroups.get(groupKey)!.items.push({ ...r, originalIndex: idx });
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search tools, resources, prompts…"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none"
          />
          <kbd className="text-[10px] text-zinc-600 border border-zinc-700 rounded px-1.5 py-0.5 font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-zinc-600">
              {query ? 'No results found.' : 'No connected servers with items to search.'}
            </div>
          )}

          {groups.length > 0 && (
            <ul ref={listRef} className="py-2">
              {groups.map((group) => (
                <li key={group.serverName}>
                  {/* Server group header */}
                  <div className="px-4 py-1.5 text-[10px] font-semibold tracking-wider uppercase text-zinc-600">
                    {group.serverName}
                  </div>
                  {group.items.map((result) => {
                    const isActive = result.originalIndex === activeIndex;
                    return (
                      <button
                        key={`${result.serverId}:${result.type}:${result.name}`}
                        type="button"
                        onClick={() => handleSelect(result)}
                        onMouseEnter={() => setActiveIndex(result.originalIndex)}
                        className={[
                          'w-full text-left px-4 py-2 flex items-start gap-2.5 transition-colors',
                          isActive ? 'bg-zinc-800' : 'hover:bg-zinc-800/60',
                        ].join(' ')}
                      >
                        {/* Bookmark star */}
                        <span className={['text-sm leading-none mt-0.5', result.bookmarked ? 'text-amber-400' : 'text-transparent'].join(' ')}>
                          ★
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={['text-[10px] font-medium px-1.5 py-0.5 rounded', TYPE_BADGE_CLASSES[result.type]].join(' ')}>
                              {result.type}
                            </span>
                            <span className="font-mono text-xs text-zinc-100 truncate">{result.name}</span>
                          </div>
                          {result.description && (
                            <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1 leading-snug">
                              {result.description}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-zinc-800 flex gap-3 text-[10px] text-zinc-600">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> select</span>
            <span><kbd className="font-mono">esc</kbd> close</span>
            <span className="ml-auto">{results.length} result{results.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}

