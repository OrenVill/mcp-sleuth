import { useEffect, useState } from 'react';
import type { LlmConfig } from '../lib/agent/types';
import type { ServerEntry, ToolResult } from '../types';
import { TAB_GROUP_META, TAB_GROUPS, type DevToolsGroupId, type DevToolsTab } from '../lib/devToolsGroups';
import { AgentReadinessPanel } from './AgentReadinessPanel';
import { ContractDriftPanel } from './ContractDriftPanel';
import { ObservationJournalPanel } from './ObservationJournalPanel';
import { PermissionSurfacePanel } from './PermissionSurfacePanel';
import { PromptInjectionPanel } from './PromptInjectionPanel';
import { ProtocolInspectorPanel } from './ProtocolInspectorPanel';
import { ReplaySuitesPanel } from './ReplaySuitesPanel';
import { SchemaLabPanel } from './SchemaLabPanel';
import { ReverseRequestsPanel } from './ReverseRequestsPanel';

interface Props {
  windowId: string;
  /** Stack order (0 = bottom); used for z-index and visual offset. */
  stackIndex: number;
  /** Only the frontmost window should handle Escape so one keypress closes one layer. */
  isTopmost: boolean;
  group: DevToolsGroupId;
  initialTab: DevToolsTab;
  servers: ServerEntry[];
  samplingLlm?: LlmConfig | null;
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
  stackIndex: number;
  group: DevToolsGroupId;
  initialTab: DevToolsTab;
  groupHeading: string;
  groupDescription: string;
  items: Array<{ id: DevToolsTab; label: string }>;
  servers: ServerEntry[];
  samplingLlm?: LlmConfig | null;
  selectedServerId: string | null;
  selectedToolName: string | null;
  onReplayToolCall: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>;
  onClose: () => void;
}

function DevToolsModalContent({
  stackIndex,
  group,
  initialTab,
  groupHeading,
  groupDescription,
  items,
  servers,
  samplingLlm = null,
  selectedServerId,
  selectedToolName,
  onReplayToolCall,
  onClose,
}: ModalContentProps) {
  const allowed = new Set(items.map((i) => i.id));
  const firstTab = items[0]?.id ?? 'protocol';
  const [activeTab, setActiveTab] = useState<DevToolsTab>(() =>
    allowed.has(initialTab) ? initialTab : firstTab,
  );

  const titleId = `dev-tools-title-${group}-${stackIndex}`;
  /** Above Scenario Runner / Agent Chat overlays (z-50) so stacked Dev Tools stay visible. */
  const z = 60 + stackIndex;
  const nudge = stackIndex * 14;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none"
      style={{ zIndex: z }}
      aria-hidden={false}
    >
      <div
        className="pointer-events-auto relative flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl w-[min(100vw-1rem,92rem)] h-[min(92vh,calc(100vh-1rem))]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          transform: `translate(${nudge}px, ${nudge}px)`,
          boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 shrink-0">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-zinc-100">
              Dev Tools — {groupHeading}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 max-w-2xl">{groupDescription}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors rounded-md p-1 hover:bg-zinc-800"
            aria-label={`Close dev tools (${groupHeading})`}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden>
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0 min-w-0">
          <nav
            className="w-52 shrink-0 border-r border-zinc-800/80 bg-zinc-950/50 overflow-y-auto py-3 px-2"
            aria-label={`Dev tools panels (${groupHeading})`}
          >
            <ul className="flex flex-col gap-0.5">
              {items.map((tab) => {
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
          </nav>

          {/* data-selectable: dev tools panels are read-only inspection surfaces
            users copy JSON, schemas and findings out of. */}
          <div data-selectable className="flex-1 min-w-0 min-h-0 overflow-hidden">
            <div hidden={activeTab !== 'protocol'} className="h-full min-h-0 overflow-hidden">
              <ProtocolInspectorPanel servers={servers} />
            </div>
            <div hidden={activeTab !== 'reverse'} className="h-full min-h-0 overflow-hidden">
              <ReverseRequestsPanel servers={servers} samplingLlm={samplingLlm} />
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
  windowId,
  stackIndex,
  isTopmost,
  group,
  initialTab,
  servers,
  samplingLlm = null,
  selectedServerId,
  selectedToolName,
  onReplayToolCall,
  onClose,
}: Props) {
  const meta = TAB_GROUP_META[group];
  const groupDef = TAB_GROUPS.find((g) => g.id === group);
  const items = groupDef?.items ?? TAB_GROUPS[0]!.items;

  useEffect(() => {
    if (!isTopmost) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTopmost, onClose]);

  return (
    <DevToolsModalContent
      key={`${windowId}-${initialTab}`}
      stackIndex={stackIndex}
      group={group}
      initialTab={initialTab}
      groupHeading={meta.heading}
      groupDescription={meta.description}
      items={items}
      servers={servers}
      samplingLlm={samplingLlm}
      selectedServerId={selectedServerId}
      selectedToolName={selectedToolName}
      onReplayToolCall={onReplayToolCall}
      onClose={onClose}
    />
  );
}
