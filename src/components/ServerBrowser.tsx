import type { ServerEntry } from '../types';
import { ToolList } from './ToolList';
import { ResourceList } from './ResourceList';
import { PromptList } from './PromptList';

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
}: Props) {
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

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'tools' as Tab, label: 'Tools', count: toolCount },
    { id: 'resources' as Tab, label: 'Resources', count: resourceCount },
    { id: 'prompts' as Tab, label: 'Prompts', count: promptCount },
  ].filter((t) => t.id === 'tools' || t.count > 0);

  const resolvedTab = tabs.some((t) => t.id === activeTab) ? activeTab : 'tools';

  return (
    <aside className="w-72 shrink-0 border-r border-zinc-800/80 flex flex-col h-full bg-zinc-950/20">
      {tabs.length > 1 && (
        <div className="flex border-b border-zinc-800/80 px-2 pt-1">
          {tabs.map((tab) => (
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
  );
}
