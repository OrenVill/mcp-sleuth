import { useState } from 'react';
import type { ResourceEntry, ResourceTemplate, ServerEntry } from '../types';

interface Props {
  server: ServerEntry;
  selectedUri: string | null;
  onSelect: (uri: string) => void;
}

function SectionHeader({ label, count, open, onToggle }: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold hover:text-zinc-300 transition-colors"
    >
      <span>{label} <span className="text-zinc-600 font-normal">({count})</span></span>
      <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </button>
  );
}

function ResourceRow({ item, selected, onSelect }: { item: ResourceEntry | ResourceTemplate; selected: boolean; onSelect: () => void }) {
  const subtitle = 'uri' in item ? item.uri : item.uriTemplate;
  return (
    <li
      onClick={onSelect}
      className={[
        'group relative mx-1.5 my-0.5 px-3 py-2 rounded-lg cursor-pointer transition-all',
        selected
          ? 'bg-zinc-900/90 border border-zinc-700/70'
          : 'border border-transparent hover:bg-zinc-900/50 hover:border-zinc-800/80',
      ].join(' ')}
    >
      {selected && (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 -translate-x-1.5 bg-violet-500 rounded-full" />
      )}
      <div className="font-mono text-xs text-zinc-100 truncate">{item.name}</div>
      <div className="text-[11px] text-zinc-500 mt-0.5 truncate leading-snug">{subtitle}</div>
    </li>
  );
}

export function ResourceList({ server, selectedUri, onSelect }: Props) {
  const [directOpen, setDirectOpen] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(true);

  const resources = server.resources ?? [];
  const templates = server.resourceTemplates ?? [];

  if (resources.length === 0 && templates.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-zinc-500 text-center">
        No resources advertised.
      </div>
    );
  }

  return (
    <ul className="py-1">
      {resources.length > 0 && (
        <>
          <SectionHeader label="Resources" count={resources.length} open={directOpen} onToggle={() => setDirectOpen((v) => !v)} />
          {directOpen && resources.map((r) => (
            <ResourceRow key={r.uri} item={r} selected={selectedUri === r.uri} onSelect={() => onSelect(r.uri)} />
          ))}
        </>
      )}
      {templates.length > 0 && (
        <>
          <SectionHeader label="Templates" count={templates.length} open={templatesOpen} onToggle={() => setTemplatesOpen((v) => !v)} />
          {templatesOpen && templates.map((t) => (
            <ResourceRow key={t.uriTemplate} item={t} selected={selectedUri === t.uriTemplate} onSelect={() => onSelect(t.uriTemplate)} />
          ))}
        </>
      )}
    </ul>
  );
}
