import { useEffect, useState } from 'react';
import {
  getStoredMcpRoots,
  setStoredMcpRoots,
  subscribeMcpRoots,
  type McpRootEntry,
} from '../lib/mcpRootsStore';
import { syncMcpRootsToHost } from '../lib/mcpRootsSync';

function useMcpRoots(): McpRootEntry[] {
  const [roots, setRoots] = useState(() => getStoredMcpRoots());
  useEffect(() => subscribeMcpRoots(() => setRoots(getStoredMcpRoots())), []);
  return roots;
}

function McpRootsEditorForm({ initialRoots }: { initialRoots: McpRootEntry[] }) {
  const [draft, setDraft] = useState(initialRoots);

  function updateRow(index: number, patch: Partial<McpRootEntry>) {
    setDraft((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setDraft((current) => [...current, { uri: 'file://', name: '' }]);
  }

  function removeRow(index: number) {
    setDraft((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setStoredMcpRoots(draft);
    await syncMcpRootsToHost();
  }

  return (
    <>
      <div className="space-y-2">
        {draft.map((row, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
            <input
              className="w-full px-2 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-100"
              value={row.uri}
              onChange={(e) => updateRow(index, { uri: e.target.value })}
              placeholder="file:///path"
              aria-label={`Root URI ${index + 1}`}
            />
            <input
              className="w-full px-2 py-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-100"
              value={row.name ?? ''}
              onChange={(e) => updateRow(index, { name: e.target.value })}
              placeholder="Label"
              aria-label={`Root label ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="text-xs px-2 py-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addRow}
          className="text-xs px-2.5 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:border-zinc-500"
        >
          Add root
        </button>
        <button
          type="button"
          onClick={() => void save()}
          className="text-xs px-2.5 py-1.5 rounded-md bg-violet-700 hover:bg-violet-600 text-white"
        >
          Save roots
        </button>
      </div>
    </>
  );
}

export function McpRootsEditor() {
  const roots = useMcpRoots();
  const formKey = roots.map((r) => `${r.uri}\0${r.name ?? ''}`).join('|');

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium text-zinc-100">Client roots</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          MCP servers may call <code className="text-zinc-400">roots/list</code> to learn which
          filesystem URIs this client exposes.
        </p>
      </div>
      <McpRootsEditorForm key={formKey} initialRoots={roots} />
    </section>
  );
}
