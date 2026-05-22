import { useState, useEffect, useCallback } from 'react';
import type { ServerEntry } from '../types';
import { exportAsMarkdown, exportAsJson, downloadFile, serverSlug } from '../lib/export';

type ExportTab = 'markdown' | 'json';

interface Props {
  server: ServerEntry;
  onClose: () => void;
}

export function ExportDialog({ server, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<ExportTab>('markdown');
  const [copied, setCopied] = useState(false);

  const content =
    activeTab === 'markdown' ? exportAsMarkdown(server) : exportAsJson(server);

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
    } else {
      downloadFile(`${slug}.json`, content, 'application/json');
    }
  }, [activeTab, content, server.name]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
        <div className="flex px-5 pt-2 shrink-0 border-b border-zinc-800/80">
          {(['markdown', 'json'] as ExportTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setActiveTab(tab); setCopied(false); }}
              className={[
                'px-3 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px uppercase tracking-wide',
                activeTab === tab
                  ? 'border-violet-500 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {tab === 'markdown' ? 'Markdown' : 'JSON'}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 p-4">
          <textarea
            readOnly
            value={content}
            className="w-full h-full font-mono text-xs bg-zinc-950/80 border border-zinc-800/60 rounded-lg p-3 text-zinc-300 resize-none outline-none focus:border-zinc-700 leading-relaxed"
            style={{ minHeight: '60vh' }}
            spellCheck={false}
          />
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
            Download .{activeTab === 'markdown' ? 'md' : 'json'}
          </button>
        </div>
      </div>
    </div>
  );
}
