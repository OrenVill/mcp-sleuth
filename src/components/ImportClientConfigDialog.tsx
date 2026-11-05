import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  mergeImportedServers,
  parseClientConfigJson,
} from '../lib/clientConfigImport';
import { fromStoredServers, toStoredServers } from '../lib/serverRecord';
import type { ServerEntry } from '../types';

interface Props {
  servers: ServerEntry[];
  onImport: (servers: ServerEntry[]) => void;
  onClose: () => void;
}

export function ImportClientConfigDialog({ servers, onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseResult = useMemo(() => {
    if (!text.trim()) return null;
    return parseClientConfigJson(text, { env: {} });
  }, [text]);

  const preview = useMemo(() => {
    if (!parseResult || parseResult.servers.length === 0) return null;
    const existing = toStoredServers(servers);
    return mergeImportedServers(existing, parseResult.servers, {
      duplicate: skipDuplicates ? 'skip' : 'replace',
    });
  }, [parseResult, servers, skipDuplicates]);

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then(setText).catch(() => setError('Could not read file'));
    e.target.value = '';
  }

  function handleImportClick() {
    setError(null);
    if (!parseResult) {
      setError('Paste or choose a client config JSON file.');
      return;
    }
    if (parseResult.errors.length > 0 && parseResult.servers.length === 0) {
      setError(parseResult.errors.join(' '));
      return;
    }
    if (!preview) {
      setError('No servers to import.');
      return;
    }
    onImport(fromStoredServers(preview.servers));
    onClose();
  }

  const unresolved = parseResult?.servers.flatMap((s) => s.unresolvedEnv) ?? [];
  const uniqueUnresolved = [...new Set(unresolved)];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh]">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-zinc-800/80 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-100">Import client config</h2>
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

        <div className="px-5 py-3 space-y-3 overflow-y-auto flex-1 min-h-0">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Paste Cursor, Claude Desktop, or VS Code <span className="font-mono text-zinc-500">mcp.json</span>.
            Auth values using <span className="font-mono">${'{env:…}'}</span> are resolved in the CLI from your
            environment; in the browser, import the server shell and set credentials in Edit.
          </p>

          <div className="flex items-center gap-2">
            <label className="text-xs px-2.5 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 cursor-pointer">
              Choose file
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none ml-auto">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="accent-violet-500 w-3 h-3"
              />
              Skip duplicates
            </label>
          </div>

          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder='{"mcpServers": { … }}'
            className="w-full min-h-[12rem] rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
            spellCheck={false}
          />

          {parseResult && parseResult.servers.length > 0 && preview && (
            <p className="text-xs text-zinc-400">
              {preview.added} to add, {preview.updated} to update
              {preview.skipped > 0 ? `, ${preview.skipped} skipped` : ''}
              {parseResult.format !== 'unknown' ? ` (${parseResult.format} format)` : ''}
            </p>
          )}

          {uniqueUnresolved.length > 0 && (
            <p className="text-xs text-amber-400/90">
              Unresolved env vars (set credentials after import):{' '}
              {uniqueUnresolved.join(', ')}
            </p>
          )}

          {parseResult?.errors.map((msg) => (
            <p key={msg} className="text-xs text-amber-500/90">
              {msg}
            </p>
          ))}

          {error && (
            <p className="text-xs text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pb-4 pt-2 shrink-0 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            disabled={!parseResult || parseResult.servers.length === 0}
            className="px-3 py-1.5 text-xs rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:pointer-events-none text-white transition-colors"
          >
            Import into vault
          </button>
        </div>
      </div>
    </div>
  );
}
