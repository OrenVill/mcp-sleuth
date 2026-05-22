import type { ServerEntry } from '../types';

interface Props {
  server: ServerEntry;
  selectedPromptName: string | null;
  onSelect: (name: string) => void;
}

export function PromptList({ server, selectedPromptName, onSelect }: Props) {
  const prompts = server.prompts ?? [];

  if (prompts.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-zinc-500 text-center">
        No prompts advertised.
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto py-1">
      {prompts.map((p) => {
        const isSelected = p.name === selectedPromptName;
        return (
          <li
            key={p.name}
            onClick={() => onSelect(p.name)}
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
            <div className="font-mono text-xs text-zinc-100 truncate">{p.name}</div>
            {p.description && (
              <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 leading-snug">
                {p.description}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
