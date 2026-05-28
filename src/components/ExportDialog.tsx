import { useState, useEffect, useCallback } from 'react';
import type { ServerEntry } from '../types';
import { exportAsMarkdown, exportAsJson, downloadFile, serverSlug } from '../lib/export';
import { generateAllConfigs } from '../lib/clientConfigExport';
import { generateHandoffReadme } from '../lib/handoffReadme';
import type { HandoffReadmeOptions } from '../lib/handoffReadme';
import type { CallRecord } from '../lib/history';
import type { ReplaySuite } from '../lib/replaySuites';
import { CodeBlock } from './CodeBlock';
import { MarkdownPreview } from './MarkdownPreview';

type ExportTab = 'markdown' | 'json' | 'client-config' | 'handoff';
type ClientTarget = 'cursor' | 'claude' | 'vscode';

interface Props {
  server: ServerEntry;
  onClose: () => void;
  history?: CallRecord[];
  replaySuites?: ReplaySuite[];
}

export function ExportDialog({ server, onClose, history, replaySuites }: Props) {
  const [activeTab, setActiveTab] = useState<ExportTab>('markdown');
  const [mdView, setMdView] = useState<'code' | 'preview'>('code');
  const [copied, setCopied] = useState(false);

  // Client config sub-target
  const [clientTarget, setClientTarget] = useState<ClientTarget>('cursor');

  // Handoff README options
  const [handoffOpts, setHandoffOpts] = useState<HandoffReadmeOptions>({
    includeReadiness: true,
    includeSchemas: false,
    includeExamples: true,
    includeReplaySuites: true,
  });
  const [handoffView, setHandoffView] = useState<'code' | 'preview'>('preview');

  const configs = generateAllConfigs({
    name: server.name,
    transport: server.transport,
    url: server.url,
    auth: server.auth,
    proxyThroughLocal: server.proxyThroughLocal,
    stdio: server.stdio,
    stdioEnv: server.stdioEnv,
  });

  function getContent(): string {
    switch (activeTab) {
      case 'markdown': return exportAsMarkdown(server);
      case 'json': return exportAsJson(server);
      case 'client-config': return configs[clientTarget];
      case 'handoff':
        return generateHandoffReadme({
          server,
          history: history ?? [],
          replaySuites: replaySuites ?? [],
          options: handoffOpts,
        });
    }
  }

  const content = getContent();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    } catch {
      // clipboard not available — silently ignore
    }
  }, [content]);

  const handleDownload = useCallback(() => {
    const slug = serverSlug(server.name);
    if (activeTab === 'markdown') {
      downloadFile(`${slug}.md`, content, 'text/markdown');
    } else if (activeTab === 'json') {
      downloadFile(`${slug}.json`, content, 'application/json');
    } else if (activeTab === 'client-config') {
      downloadFile(`${slug}-${clientTarget}-mcp.json`, content, 'application/json');
    } else {
      downloadFile(`${slug}-handoff.md`, content, 'text/markdown');
    }
  }, [activeTab, content, server.name, clientTarget]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const tabLabel: Record<ExportTab, string> = {
    markdown: 'Markdown',
    json: 'JSON',
    'client-config': 'Client Config',
    handoff: 'Handoff README',
  };

  const showMarkdownToggle = activeTab === 'markdown' || activeTab === 'handoff';
  const currentMdView = activeTab === 'handoff' ? handoffView : mdView;
  const setCurrentMdView = activeTab === 'handoff'
    ? setHandoffView
    : setMdView;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-zinc-800/80 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-100">
            Export{' '}
            <span className="font-mono text-violet-400">{server.name}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors rounded-md p-1 -mr-1 hover:bg-zinc-800"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden>
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center px-5 pt-2 shrink-0 border-b border-zinc-800/80">
          {(['markdown', 'json', 'client-config', 'handoff'] as ExportTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setActiveTab(tab); setCopied(false); }}
              className={[
                'px-3 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px uppercase tracking-wide whitespace-nowrap',
                activeTab === tab
                  ? 'border-violet-500 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {tabLabel[tab]}
            </button>
          ))}
          {showMarkdownToggle && (
            <div className="ml-auto mb-1 inline-flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
              {(['code', 'preview'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCurrentMdView(v)}
                  className={
                    currentMdView === v
                      ? 'px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-700 text-zinc-100'
                      : 'px-2 py-0.5 rounded text-[10px] font-medium text-zinc-500 hover:text-zinc-300'
                  }
                >
                  {v === 'code' ? 'Code' : 'Preview'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Client Config sub-nav */}
        {activeTab === 'client-config' && (
          <div className="flex items-center gap-2 px-5 py-2 shrink-0 border-b border-zinc-800/40 bg-zinc-900/50">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide mr-1">Target:</span>
            {(['cursor', 'claude', 'vscode'] as ClientTarget[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setClientTarget(t)}
                className={[
                  'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                  clientTarget === t
                    ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent hover:bg-zinc-800',
                ].join(' ')}
              >
                {t === 'cursor' ? 'Cursor' : t === 'claude' ? 'Claude' : 'VS Code'}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-zinc-600">Auth secrets are replaced with env-var placeholders</span>
          </div>
        )}

        {/* Handoff README options */}
        {activeTab === 'handoff' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 shrink-0 border-b border-zinc-800/40 bg-zinc-900/50">
            {(
              [
                ['includeReadiness', 'Readiness'],
                ['includeSchemas', 'Full Schemas'],
                ['includeExamples', 'Examples'],
                ['includeReplaySuites', 'Replay Suites'],
              ] as [keyof HandoffReadmeOptions, string][]
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!handoffOpts[key]}
                  onChange={(e) =>
                    setHandoffOpts((o) => ({ ...o, [key]: e.target.checked }))
                  }
                  className="accent-violet-500 w-3 h-3"
                />
                <span className="text-[11px] text-zinc-400">{label}</span>
              </label>
            ))}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-auto p-4">
          <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/80 overflow-hidden" style={{ minHeight: '50vh' }}>
            {(activeTab === 'markdown' && mdView === 'preview') ||
             (activeTab === 'handoff' && handoffView === 'preview') ? (
              <MarkdownPreview source={content} />
            ) : (
              <CodeBlock
                code={content}
                lang={activeTab === 'json' || activeTab === 'client-config' ? 'json' : 'markdown'}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-4 pt-2 shrink-0 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800/50 transition-colors"
          >
            {copied ? (
              <>
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-green-400" aria-hidden>
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                </svg>
                <span className="text-green-400">Copied!</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
                  <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
                  <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                </svg>
                Copy to clipboard
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
              <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
              <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.97a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.97Z" />
            </svg>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
