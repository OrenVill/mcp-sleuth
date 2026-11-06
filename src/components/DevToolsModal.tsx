import { useEffect, useState } from 'react';
import type { ServerEntry, ToolResult } from '../types';
import { AgentReadinessPanel } from './AgentReadinessPanel';
import { ContractDriftPanel } from './ContractDriftPanel';
import { ObservationJournalPanel } from './ObservationJournalPanel';
import { PermissionSurfacePanel } from './PermissionSurfacePanel';
import { PromptInjectionPanel } from './PromptInjectionPanel';
import { ProtocolInspectorPanel } from './ProtocolInspectorPanel';
import { ReplaySuitesPanel } from './ReplaySuitesPanel';
import { SchemaLabPanel } from './SchemaLabPanel';
import { ReverseRequestsPanel } from './ReverseRequestsPanel';

export type DevToolsTab =
  | 'protocol'
  | 'reverse'
  | 'replay'
  | 'schema'
  | 'permission'
  | 'injection'
  | 'journal'
  | 'readiness'
  | 'contract';

interface Props {
  open: boolean;
  initialTab: DevToolsTab;
  servers: ServerEntry[];
  selectedServerId: string | null;
  selectedToolName: string | null;
  onReplayToolCall: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>;
  onClose: () => void;
}

interface ModalContentProps {
  initialTab: DevToolsTab;
  servers: ServerEntry[];
  selectedServerId: string | null;
  selectedToolName: string | null;
  onReplayToolCall: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>;
  onClose: () => void;
}

/** Grouped navigation: same `label` strings as before so Playwright helpers stay stable. */
const TAB_GROUPS: Array<{
  heading: string;
  description: string;
  items: Array<{ id: DevToolsTab; label: string }>;
}> = [
  {
    heading: 'Traffic',
    description: 'Live protocol timeline and inbound server traffic.',
    items: [
      { id: 'protocol', label: 'Protocol Inspector' },
      { id: 'reverse', label: 'Server Requests' },
    ],
  },
  {
    heading: 'Testing',
    description: 'Replay calls, inspect schemas, and compare contract drift.',
    items: [
      { id: 'replay', label: 'Replay Suites' },
      { id: 'schema', label: 'Schema Lab' },
      { id: 'contract', label: 'Contract Drift' },
    ],
  },
  {
    heading: 'Trust & risk',
    description: 'Static audits, injection scan, journal, and readiness score.',
    items: [
      { id: 'permission', label: 'Permission Surface' },
      { id: 'injection', label: 'Prompt Injection' },
      { id: 'journal', label: 'Observation Journal' },
      { id: 'readiness', label: 'Agent Readiness' },
    ],
  },
];

function DevToolsModalContent({
  initialTab,
  servers,
  selectedServerId,
  selectedToolName,
  onReplayToolCall,
  onClose,
}: ModalContentProps) {
  const [activeTab, setActiveTab] = useState<DevToolsTab>(() => initialTab);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl w-full max-w-6xl mx-4 h-[84vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dev-tools-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 shrink-0">
          <div>
            <h2 id="dev-tools-title" className="text-sm font-semibold text-zinc-100">
              Dev Tools
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 max-w-2xl">
              MCP inspection and trust tooling — pick a panel from the sidebar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors rounded-md p-1 hover:bg-zinc-800"
            aria-label="Close dev tools"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden>
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav
            className="w-56 shrink-0 border-r border-zinc-800/80 bg-zinc-950/50 overflow-y-auto py-3 px-2 flex flex-col gap-4"
            aria-label="Dev tools panels"
          >
            {TAB_GROUPS.map((group) => (
              <div key={group.heading}>
                <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {group.heading}
                </p>
                <p className="px-2 mb-2 text-[10px] leading-snug text-zinc-600">{group.description}</p>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((tab) => {
                    const selected = activeTab === tab.id;
                    return (
                      <li key={tab.id}>
                        <button
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          aria-current={selected ? 'page' : undefined}
                          className={[
                            'w-full text-left rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                            selected
                              ? 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/40'
                              : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200',
                          ].join(' ')}
                        >
                          {tab.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* data-selectable: dev tools panels are read-only inspection surfaces
            users copy JSON, schemas and findings out of. */}
          <div data-selectable className="flex-1 min-w-0 min-h-0 overflow-hidden">
            <div hidden={activeTab !== 'protocol'} className="h-full min-h-0 overflow-hidden">
              <ProtocolInspectorPanel servers={servers} />
            </div>
            <div hidden={activeTab !== 'reverse'} className="h-full min-h-0 overflow-hidden">
              <ReverseRequestsPanel servers={servers} />
            </div>
            <div hidden={activeTab !== 'replay'} className="h-full min-h-0 overflow-hidden">
              <ReplaySuitesPanel servers={servers} onReplayToolCall={onReplayToolCall} />
            </div>
            <div hidden={activeTab !== 'schema'} className="h-full min-h-0 overflow-hidden">
              <SchemaLabPanel
                servers={servers}
                selectedServerId={selectedServerId}
                selectedToolName={selectedToolName}
              />
            </div>
            <div hidden={activeTab !== 'permission'} className="h-full min-h-0 overflow-hidden">
              <PermissionSurfacePanel servers={servers} />
            </div>
            <div hidden={activeTab !== 'injection'} className="h-full min-h-0 overflow-hidden">
              <PromptInjectionPanel servers={servers} />
            </div>
            <div hidden={activeTab !== 'journal'} className="h-full min-h-0 overflow-hidden">
              <ObservationJournalPanel
                servers={servers}
                selectedServerId={selectedServerId}
                selectedToolName={selectedToolName}
              />
            </div>
            <div hidden={activeTab !== 'contract'} className="h-full min-h-0 overflow-hidden">
              <ContractDriftPanel servers={servers} selectedServerId={selectedServerId} />
            </div>
            <div hidden={activeTab !== 'readiness'} className="h-full min-h-0 overflow-hidden">
              <AgentReadinessPanel servers={servers} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DevToolsModal({
  open,
  initialTab,
  servers,
  selectedServerId,
  selectedToolName,
  onReplayToolCall,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <DevToolsModalContent
      key={initialTab}
      initialTab={initialTab}
      servers={servers}
      selectedServerId={selectedServerId}
      selectedToolName={selectedToolName}
      onReplayToolCall={onReplayToolCall}
      onClose={onClose}
    />
  );
}
