import { useMemo } from 'react';
import type { ServerEntry } from '../types';
import { getAppVersion } from '../lib/appVersion';
import {
  buildChatExport,
  chatExportFilename,
  chatToJson,
  chatToMarkdown,
} from '../lib/agent/chatExport';
import type { AgentMessage, LlmConfig } from '../lib/agent/types';
import { saveDownloadFile } from '../lib/export';
import { CopyMarkdownButton } from './CopyMarkdownButton';
import { Popover } from './Popover';

interface Props {
  messages: AgentMessage[];
  config: LlmConfig | null;
  servers: ServerEntry[];
  selectedServerIds: string[];
  disabled: boolean;
  onNotice: (message: string) => void;
}

function scopedServers(servers: ServerEntry[], selectedServerIds: string[]) {
  const picked = new Set(selectedServerIds);
  return servers
    .filter((s) => picked.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));
}

export function AgentChatExportMenu({
  messages,
  config,
  servers,
  selectedServerIds,
  disabled,
  onNotice,
}: Props) {
  const exportPayload = useMemo(() => {
    const exportedAt = new Date();
    return {
      exportedAt,
      data: buildChatExport({
        messages,
        config,
        servers: scopedServers(servers, selectedServerIds),
        exportedAt,
        appVersion: getAppVersion(),
      }),
    };
  }, [config, messages, selectedServerIds, servers]);

  async function save(format: 'md' | 'json') {
    if (disabled) return;
    const { exportedAt, data } = exportPayload;
    const filename = chatExportFilename(format, exportedAt);
    const content = format === 'md' ? chatToMarkdown(data) : chatToJson(data);
    const mime = format === 'md' ? 'text/markdown' : 'application/json';
    const result = await saveDownloadFile(filename, content, mime);
    if (result === 'saved') onNotice(`Saved ${filename}.`);
    else if (result === 'cancelled') onNotice('Save cancelled.');
    else onNotice('Save failed.');
  }

  return (
    <Popover
      testId="agent-export"
      aria-label="Export chat"
      align="right"
      panelClassName="w-72"
      trigger={({ open }) => (
        <span
          className={[
            'shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border transition-colors',
            open
              ? 'border-violet-800/70 bg-violet-950/30 text-violet-300'
              : 'border-zinc-800 text-zinc-400 hover:text-violet-300 hover:border-violet-800/70 hover:bg-violet-950/30',
          ].join(' ')}
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
            <path
              d="M8 2.5v7M5 9.5 8 12.5l3-3M3.5 13.5h9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Export
        </span>
      )}
    >
      {({ close }) => (
        <div className="space-y-3 p-1">
          <p className="text-[11px] text-zinc-500 leading-snug px-1">
            Exports the conversation as shown. Tool output is best-effort scrubbed for
            secrets — review before sharing.
          </p>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-600 px-1">Markdown</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="agent-export-markdown-save"
                disabled={disabled}
                onClick={() => {
                  void save('md').then(() => close());
                }}
                className="px-3 py-2 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Save to file
              </button>
              <CopyMarkdownButton
                label="Copy"
                testId="agent-export-markdown-copy"
                disabled={disabled}
                getText={() => chatToMarkdown(exportPayload.data)}
                className="py-2"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-600 px-1">JSON</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="agent-export-json-save"
                disabled={disabled}
                onClick={() => {
                  void save('json').then(() => close());
                }}
                className="px-3 py-2 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Save to file
              </button>
              <CopyMarkdownButton
                label="Copy"
                testId="agent-export-json-copy"
                disabled={disabled}
                getText={() => chatToJson(exportPayload.data)}
                className="py-2"
              />
            </div>
          </div>
        </div>
      )}
    </Popover>
  );
}
