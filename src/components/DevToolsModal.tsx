import { useEffect, useState } from 'react';
import type { ServerEntry } from '../types';
import { ProtocolInspectorPanel } from './ProtocolInspectorPanel';
import { SchemaLabPanel } from './SchemaLabPanel';

export type DevToolsTab = 'protocol' | 'schema';

interface Props {
  open: boolean;
  initialTab: DevToolsTab;
  servers: ServerEntry[];
  selectedServerId: string | null;
  selectedToolName: string | null;
  onClose: () => void;
}

interface ModalContentProps {
  initialTab: DevToolsTab;
  servers: ServerEntry[];
  selectedServerId: string | null;
  selectedToolName: string | null;
  onClose: () => void;
}

const TABS: Array<{ id: DevToolsTab; label: string }> = [
  { id: 'protocol', label: 'Protocol Inspector' },
  { id: 'schema', label: 'Schema Lab' },
];

function DevToolsModalContent({
  initialTab,
  servers,
  selectedServerId,
  selectedToolName,
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
      <div className="relative flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl w-full max-w-6xl mx-4 h-[84vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Dev Tools</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Inspect runtime MCP traffic and debug tool schemas.
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

        <div className="flex items-center px-5 pt-2 shrink-0 border-b border-zinc-800/80">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={[
                'px-3 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px uppercase tracking-wide',
                activeTab === tab.id
                  ? 'border-violet-500 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <div hidden={activeTab !== 'protocol'} className="h-full min-h-0 overflow-hidden">
            <ProtocolInspectorPanel servers={servers} />
          </div>
          <div hidden={activeTab !== 'schema'} className="h-full min-h-0 overflow-hidden">
            <SchemaLabPanel
              servers={servers}
              selectedServerId={selectedServerId}
              selectedToolName={selectedToolName}
            />
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
      onClose={onClose}
    />
  );
}
