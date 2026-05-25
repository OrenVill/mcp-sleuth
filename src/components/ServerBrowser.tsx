import { useState } from 'react';
import type { ServerEntry } from '../types';
import type { CallRecord } from '../lib/history';
import type { ReplaySuite } from '../lib/replaySuites';
import { ToolList } from './ToolList';
import { ResourceList } from './ResourceList';
import { PromptList } from './PromptList';
import { ExportDialog } from './ExportDialog';

type Tab = 'tools' | 'resources' | 'prompts';

interface Props {
  server: ServerEntry | null;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  selectedToolName: string | null;
  onSelectTool: (name: string) => void;
  selectedResourceUri: string | null;
  onSelectResource: (uri: string) => void;
  selectedPromptName: string | null;
  onSelectPrompt: (name: string) => void;
  history?: CallRecord[];
  replaySuites?: ReplaySuite[];
}

export function ServerBrowser({
  server,
  activeTab,
  onTabChange,
  selectedToolName,
  onSelectTool,
  selectedResourceUri,
  onSelectResource,
  selectedPromptName,
  onSelectPrompt,
  history,
  replaySuites,
}: Props) {
  const [exportOpen, setExportOpen] = useState(false);

  if (!server || server.status !== 'connected') {
    return (
      <ToolList
        server={server}
        selectedToolName={selectedToolName}
        onSelect={onSelectTool}
      />
    );
  }

  const toolCount = (server.tools?.length ?? 0) + (server.discovered?.length ?? 0);
  const resourceCount = (server.resources?.length ?? 0) + (server.resourceTemplates?.length ?? 0);
  const promptCount = server.prompts?.length ?? 0;
  const hasContent = toolCount > 0 || resourceCount > 0 || promptCount > 0;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'tools' as Tab, label: 'Tools', count: toolCount },
    { id: 'resources' as Tab, label: 'Resources', count: resourceCount },
    { id: 'prompts' as Tab, label: 'Prompts', count: promptCount },
  ].filter((t) => t.id === 'tools' || t.count > 0);

  const resolvedTab = tabs.some((t) => t.id === activeTab) ? activeTab : 'tools';

  return (
    <>
    <aside className="w-72 shrink-0 border-r border-zinc-800/80 flex flex-col h-full bg-zinc-950/20">
      {(tabs.length > 1 || hasContent) && (
        <div className="flex items-center border-b border-zinc-800/80 px-2 pt-1">
          <div className="flex flex-1">
            {tabs.length > 1 && tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={[
                  'px-3 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px',
                  resolvedTab === tab.id
                    ? 'border-violet-500 text-zinc-100'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300',
                ].join(' ')}
              >
                {tab.label}
                <span className={['ml-1.5', resolvedTab === tab.id ? 'text-zinc-400' : 'text-zinc-600'].join(' ')}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
          {hasContent && (
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              title="Export server documentation"
              className="mb-1 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden>
                <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
                <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.97a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.97Z" />
              </svg>
              Export
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {resolvedTab === 'tools' && (
          <ToolList
            server={server}
            selectedToolName={selectedToolName}
            onSelect={onSelectTool}
            embedded
          />
        )}
        {resolvedTab === 'resources' && (
          <ResourceList
            server={server}
            selectedUri={selectedResourceUri}
            onSelect={onSelectResource}
          />
        )}
        {resolvedTab === 'prompts' && (
          <PromptList
            server={server}
            selectedPromptName={selectedPromptName}
            onSelect={onSelectPrompt}
          />
        )}
      </div>
    </aside>
    {exportOpen && (
      <ExportDialog
        server={server}
        onClose={() => setExportOpen(false)}
        history={history}
        replaySuites={replaySuites}
      />
    )}
    </>
  );
}
