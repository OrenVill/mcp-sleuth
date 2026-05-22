import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ServerList } from './components/ServerList';
import { ServerBrowser } from './components/ServerBrowser';
import { ToolDetail } from './components/ToolDetail';
import { ResourceDetail } from './components/ResourceDetail';
import { PromptDetail } from './components/PromptDetail';
import { VaultLockButton } from './components/VaultLockButton';
import { VaultSetup } from './components/VaultSetup';
import { VaultUnlock } from './components/VaultUnlock';
import {
  ServerFormDialog,
  type ServerFormValues,
} from './components/ServerFormDialog';
import { Logo } from './components/Logo';
import { GlobalSearch } from './components/GlobalSearch';
import { formatConnectionError } from './lib/connectionErrorMessage';
import { connect, disconnect, callTool as mcpCallTool, onToolsChanged, refetchTools, listResources, listPrompts } from './lib/mcpClient';
import { detectMetaTools } from './lib/discovery/detect';
import { runDiscovery } from './lib/discovery/orchestrator';
import { loadLegacyServers, type StoredServer } from './lib/storage';
import { initAppData } from './lib/appData';
import {
  createVault,
  getBootstrapPhase,
  resetVault,
  saveVault,
  unlockVault,
} from './lib/vault/service';
import type { DiscoveryRun, MetaToolBinding, ServerAuth, ServerEntry } from './types';

type VaultPhase = 'loading' | 'needs-setup' | 'needs-unlock' | 'ready';

function fromStoredServers(stored: StoredServer[]): ServerEntry[] {
  return stored.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    description: s.description,
    auth: s.auth,
    custom: s.custom ?? true,
    status: 'disconnected',
  }));
}

function toStoredServers(servers: ServerEntry[]): StoredServer[] {
  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    url: server.url,
    description: server.description,
    custom: server.custom,
    auth: server.auth,
  }));
}

function makeId(name: string, existing: Set<string>): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
    'server';
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export default function App() {
  const [vaultPhase, setVaultPhase] = useState<VaultPhase>('loading');
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tools' | 'resources' | 'prompts'>('tools');
  const [selectedResourceUri, setSelectedResourceUri] = useState<string | null>(null);
  const [selectedPromptName, setSelectedPromptName] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const aesKeyRef = useRef<CryptoKey | null>(null);
  const serversRef = useRef<ServerEntry[]>(servers);
  const vaultPhaseRef = useRef<VaultPhase>(vaultPhase);
  const discoveryControllersRef = useRef<Map<string, AbortController>>(new Map());
  /** Bumps when the add/edit modal opens so the form remounts with fresh initial state (no reset-in-effect). */
  const [dialogFormKey, setDialogFormKey] = useState(0);

  useLayoutEffect(() => {
    serversRef.current = servers;
    vaultPhaseRef.current = vaultPhase;
  }, [servers, vaultPhase]);

  useEffect(() => {
    void (async () => {
      await initAppData().catch(() => { /* silent — falls back to in-memory defaults */ });
      try {
        const phase = await getBootstrapPhase();
        setVaultPhase(phase);
      } catch {
        setVaultError('Could not initialize vault.');
        setVaultPhase('needs-setup');
      }
    })();
  }, []);

  useEffect(() => {
    if (vaultPhase !== 'ready' || !aesKeyRef.current) return;
    void saveVault(aesKeyRef.current, toStoredServers(servers)).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setVaultError(`Vault save failed: ${message}`);
    });
  }, [servers, vaultPhase]);

  /** Best-effort flush before tab close / crash so IndexedDB has the latest ciphertext (see Page Lifecycle). */
  useEffect(() => {
    function flushVaultToDisk() {
      const phase = vaultPhaseRef.current;
      const key = aesKeyRef.current;
      if (phase !== 'ready' || !key) return;
      void saveVault(key, toStoredServers(serversRef.current)).catch((err: unknown) => {
        console.error('mcp-explorer: vault background save failed', err);
      });
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flushVaultToDisk();
    }

    window.addEventListener('pagehide', flushVaultToDisk);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushVaultToDisk);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedId) ?? null,
    [servers, selectedId],
  );

  const selectedTool = useMemo(() => {
    if (!selectedServer || !selectedToolName) return null;
    const native = selectedServer.tools?.find((t) => t.name === selectedToolName);
    if (native) return native;
    return selectedServer.discovered?.find((t) => t.name === selectedToolName) ?? null;
  }, [selectedServer, selectedToolName]);

  const selectedMeta = useMemo(() => {
    if (!selectedServer || !selectedToolName) return null;
    return selectedServer.metaTools?.find((m) => m.toolName === selectedToolName) ?? null;
  }, [selectedServer, selectedToolName]);

  const selectedRun = useMemo<DiscoveryRun>(() => {
    const existing = selectedServer && selectedToolName ? selectedServer.discoveryRuns?.[selectedToolName] : undefined;
    return existing ?? { status: 'idle', probesAttempted: 0, callsMade: 0, toolsFound: 0 };
  }, [selectedServer, selectedToolName]);

  const selectedResource = useMemo(() => {
    if (!selectedServer || !selectedResourceUri) return null;
    const direct = selectedServer.resources?.find((r) => r.uri === selectedResourceUri);
    if (direct) return { type: 'direct' as const, uri: selectedResourceUri };
    const template = selectedServer.resourceTemplates?.find((t) => t.uriTemplate === selectedResourceUri);
    if (template) return { type: 'template' as const, uri: selectedResourceUri };
    return null;
  }, [selectedServer, selectedResourceUri]);

  const selectedPrompt = useMemo(() => {
    if (!selectedServer || !selectedPromptName) return null;
    return selectedServer.prompts?.find((p) => p.name === selectedPromptName) ?? null;
  }, [selectedServer, selectedPromptName]);

  const editingServer = useMemo(
    () => (editingId ? servers.find((s) => s.id === editingId) ?? null : null),
    [servers, editingId],
  );

  function updateServer(id: string, patch: Partial<ServerEntry>) {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  /**
   * When opening from Add/Edit, pass `connection` so connect runs with the submitted URL/auth
   * even before React has committed the new/updated server row (avoids a stale `servers.find`).
   */
  async function handleConnect(
    id: string,
    connection?: { url: string; auth?: ServerAuth },
  ) {
    const s = servers.find((x) => x.id === id);
    const url = connection?.url ?? s?.url;
    const auth = connection !== undefined ? connection.auth : s?.auth;
    if (!url) return;
    setSelectedId(id);
    setSelectedToolName(null);
    updateServer(id, { status: 'connecting', error: undefined });
    try {
      const tools = await connect(id, url, auth);
      const metaTools = detectMetaTools(tools);

      // Fetch resources and prompts in parallel; ignore if server doesn't support them
      const [resourceResult, promptResult] = await Promise.allSettled([
        listResources(id),
        listPrompts(id),
      ]);

      const resources = resourceResult.status === 'fulfilled' ? resourceResult.value.resources : undefined;
      const resourceTemplates = resourceResult.status === 'fulfilled' ? resourceResult.value.templates : undefined;
      const prompts = promptResult.status === 'fulfilled' ? promptResult.value : undefined;

      updateServer(id, {
        status: 'connected',
        tools,
        metaTools,
        resources,
        resourceTemplates,
        prompts,
        discovered: undefined,
        discoveryRuns: {},
        error: undefined,
      });
      onToolsChanged(id, () => {
        void refetchTools(id).then((next) => {
          const nextMeta = detectMetaTools(next);
          updateServer(id, { tools: next, metaTools: nextMeta });
        });
      });
    } catch (e) {
      updateServer(id, { status: 'error', error: formatConnectionError(e) });
    }
  }

  async function handleDisconnect(id: string) {
    await disconnect(id);
    updateServer(id, {
      status: 'disconnected',
      tools: undefined,
      metaTools: undefined,
      discovered: undefined,
      discoveryRuns: undefined,
    });
    if (selectedId === id) {
      setSelectedToolName(null);
      setSelectedResourceUri(null);
      setSelectedPromptName(null);
    }
  }

  async function handleDiscover(
    serverId: string,
    metaToolName: string,
    opts?: { alphabetSweep?: boolean },
  ) {
    const server = serversRef.current.find((s) => s.id === serverId);
    if (!server) return;
    const meta = server.metaTools?.find((m) => m.toolName === metaToolName);
    if (!meta) return;

    const key = `${serverId}:${metaToolName}`;
    discoveryControllersRef.current.get(key)?.abort();
    const controller = new AbortController();
    discoveryControllersRef.current.set(key, controller);

    const runningRun: DiscoveryRun = {
      status: 'running',
      startedAt: Date.now(),
      probesAttempted: 0,
      callsMade: 0,
      toolsFound: 0,
    };
    updateServer(serverId, {
      discoveryRuns: { ...(server.discoveryRuns ?? {}), [metaToolName]: runningRun },
    });

    const fullMeta: MetaToolBinding = {
      ...meta,
      inputSchema: server.tools?.find((t) => t.name === meta.toolName)?.inputSchema,
    };
    const allWithSchema: MetaToolBinding[] = (server.metaTools ?? []).map((m) => ({
      ...m,
      inputSchema: server.tools?.find((t) => t.name === m.toolName)?.inputSchema,
    }));

    const result = await runDiscovery({
      serverId,
      metaTool: fullMeta,
      allMetaTools: allWithSchema,
      callTool: (n, a) => mcpCallTool(serverId, n, a),
      onProbe: (event) => {
        const current = serversRef.current.find((s) => s.id === serverId);
        const prevRun = current?.discoveryRuns?.[metaToolName];
        if (!prevRun) return;
        updateServer(serverId, {
          discoveryRuns: {
            ...(current?.discoveryRuns ?? {}),
            [metaToolName]: {
              ...prevRun,
              callsMade: event.callsMade,
              toolsFound: event.totalToolsSoFar,
              probesAttempted: prevRun.probesAttempted + 1,
            },
          },
        });
      },
      signal: controller.signal,
      options: opts,
    });

    const latest = serversRef.current.find((s) => s.id === serverId);
    if (!latest) return;
    const existing = latest.discovered ?? [];
    const byName = new Map(existing.map((t) => [t.name, t]));
    for (const t of result.tools) if (!byName.has(t.name)) byName.set(t.name, t);
    updateServer(serverId, {
      discovered: Array.from(byName.values()),
      discoveryRuns: {
        ...(latest.discoveryRuns ?? {}),
        [metaToolName]: result.run,
      },
    });
    discoveryControllersRef.current.delete(key);
  }

  function handleDiscoveryStop(serverId: string, metaToolName: string) {
    const key = `${serverId}:${metaToolName}`;
    discoveryControllersRef.current.get(key)?.abort();
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setSelectedToolName(null);
    setSelectedResourceUri(null);
    setSelectedPromptName(null);
  }

  function handleAddClick() {
    setDialogFormKey((k) => k + 1);
    setEditingId(null);
    setDialogMode('add');
  }

  function handleEditClick(id: string) {
    setDialogFormKey((k) => k + 1);
    setEditingId(id);
    setDialogMode('edit');
  }

  function handleDialogClose() {
    setDialogMode(null);
    setEditingId(null);
  }

  function handleSubmit(values: ServerFormValues) {
    if (dialogMode === 'add') {
      const existingIds = new Set(servers.map((s) => s.id));
      const id = makeId(values.name, existingIds);
      const entry: ServerEntry = {
        id,
        name: values.name,
        url: values.url,
        description: values.description,
        auth: values.auth,
        custom: true,
        status: 'disconnected',
      };
      setServers((prev) => [...prev, entry]);
      handleDialogClose();
      void handleConnect(id, { url: values.url, auth: values.auth });
      return;
    }

    if (dialogMode === 'edit' && editingId) {
      const target = servers.find((s) => s.id === editingId);
      if (!target) {
        handleDialogClose();
        return;
      }
      updateServer(editingId, {
        name: values.name,
        url: values.url,
        description: values.description,
        auth: values.auth,
      });
      handleDialogClose();
      void handleConnect(editingId, { url: values.url, auth: values.auth });
    }
  }

  function dialogValidate(values: ServerFormValues): string | null {
    if (dialogMode === 'add') {
      if (servers.some((s) => s.name === values.name)) {
        return `A server named "${values.name}" already exists`;
      }
    } else if (dialogMode === 'edit' && editingId) {
      if (
        servers.some((s) => s.id !== editingId && s.name === values.name)
      ) {
        return `Another server is already named "${values.name}"`;
      }
    }
    return null;
  }

  async function handleRemove(id: string) {
    await disconnect(id);
    setServers((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedToolName(null);
    }
  }

  const dialogInitial: ServerFormValues | undefined =
    dialogMode === 'edit' && editingServer
      ? {
          name: editingServer.name,
          url: editingServer.url,
          description: editingServer.description,
          auth: editingServer.auth,
        }
      : undefined;

  const connectedCount = servers.filter((s) => s.status === 'connected').length;

  async function handleVaultCreate(passphrase: string) {
    setVaultBusy(true);
    setVaultError(null);
    try {
      const legacyServers = loadLegacyServers() ?? [];
      const aesKey = await createVault(passphrase, legacyServers);
      aesKeyRef.current = aesKey;
      setServers(fromStoredServers(legacyServers));
      setVaultPhase('ready');
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Could not create vault.');
    } finally {
      setVaultBusy(false);
    }
  }

  async function handleVaultUnlock(passphrase: string) {
    setVaultBusy(true);
    setVaultError(null);
    try {
      const { aesKey, servers: storedServers } = await unlockVault(passphrase);
      aesKeyRef.current = aesKey;
      setServers(fromStoredServers(storedServers));
      setVaultPhase('ready');
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Could not unlock vault.');
    } finally {
      setVaultBusy(false);
    }
  }

  function handleVaultLock() {
    const snapshot = servers;
    setVaultPhase('needs-unlock');
    setVaultError(null);
    setSelectedId(null);
    setSelectedToolName(null);
    void Promise.allSettled(
      snapshot
        .filter((server) => server.status === 'connected')
        .map((server) => disconnect(server.id)),
    ).finally(() => {
      aesKeyRef.current = null;
      setServers([]);
    });
  }

  async function handleVaultReset() {
    if (!window.confirm('Reset vault? This will permanently remove all stored servers and credentials.')) {
      return;
    }
    setVaultBusy(true);
    try {
      await resetVault();
      aesKeyRef.current = null;
      setServers([]);
      setSelectedId(null);
      setSelectedToolName(null);
      setVaultError(null);
      setVaultPhase('needs-setup');
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Could not reset vault.');
    } finally {
      setVaultBusy(false);
    }
  }

  function handleGlobalSelectTool(serverId: string, toolName: string) {
    setSelectedId(serverId);
    setActiveTab('tools');
    setSelectedToolName(toolName);
    setSelectedResourceUri(null);
    setSelectedPromptName(null);
  }

  function handleGlobalSelectResource(serverId: string, uri: string) {
    setSelectedId(serverId);
    setActiveTab('resources');
    setSelectedResourceUri(uri);
    setSelectedToolName(null);
    setSelectedPromptName(null);
  }

  function handleGlobalSelectPrompt(serverId: string, name: string) {
    setSelectedId(serverId);
    setActiveTab('prompts');
    setSelectedPromptName(name);
    setSelectedToolName(null);
    setSelectedResourceUri(null);
  }

  if (vaultPhase === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950 text-zinc-300">
        Loading...
      </div>
    );
  }

  if (vaultPhase === 'needs-setup') {
    return (
      <VaultSetup
        onCreate={handleVaultCreate}
        migrationHint={Boolean(loadLegacyServers()?.length)}
        error={vaultError}
        busy={vaultBusy}
      />
    );
  }

  if (vaultPhase === 'needs-unlock') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-zinc-950 px-4">
        <VaultUnlock onUnlock={handleVaultUnlock} error={vaultError} busy={vaultBusy} />
        <button
          type="button"
          onClick={() => void handleVaultReset()}
          disabled={vaultBusy}
          className="mt-4 text-xs px-3 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:text-red-300 hover:border-red-800 hover:bg-red-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset vault
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <header className="border-b border-zinc-800/80 px-5 py-3 flex items-center justify-between bg-zinc-950/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <Logo size={30} className="shadow-lg shadow-violet-900/30 rounded-[8px]" />
          <div className="flex items-baseline gap-2">
            <h1 className="text-zinc-50 font-semibold tracking-tight">
              MCP Explorer
            </h1>
            <span className="text-xs text-zinc-500 hidden sm:inline">
              connect · list · invoke
            </span>
          </div>
          {servers.length > 0 && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
              {connectedCount}/{servers.length} connected
            </span>
          )}
          {vaultError && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-950/50 border border-red-900/60 text-red-300">
              {vaultError}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <VaultLockButton onLock={handleVaultLock} />
          <button
            type="button"
            onClick={() => {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
            }}
            title="Search (⌘K)"
            className="text-xs px-2 py-1 rounded-md border border-zinc-700/80 bg-zinc-900/60 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 transition-colors flex items-center gap-1 font-mono"
          >
            <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
              <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>⌘K</span>
          </button>
          <a
            href="https://github.com/OrenVill/mcp-explorer"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors flex items-center gap-1.5"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
        </div>
      </header>
      <div className="flex-1 flex min-h-0">
        <ServerList
          servers={servers}
          selectedId={selectedId}
          onSelect={handleSelect}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onEdit={handleEditClick}
          onRemove={handleRemove}
          onAddClick={handleAddClick}
        />
        <ServerBrowser
          server={selectedServer}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setSelectedToolName(null);
            setSelectedResourceUri(null);
            setSelectedPromptName(null);
          }}
          selectedToolName={selectedToolName}
          onSelectTool={setSelectedToolName}
          selectedResourceUri={selectedResourceUri}
          onSelectResource={setSelectedResourceUri}
          selectedPromptName={selectedPromptName}
          onSelectPrompt={setSelectedPromptName}
        />
        {activeTab === 'resources' && selectedServer && selectedResource ? (
          <ResourceDetail
            key={selectedResource.uri}
            server={selectedServer}
            uri={selectedResource.uri}
          />
        ) : activeTab === 'prompts' && selectedServer && selectedPrompt ? (
          <PromptDetail
            key={`${selectedServer.id}:${selectedPrompt.name}`}
            server={selectedServer}
            prompt={selectedPrompt}
          />
        ) : (
          <ToolDetail
            server={selectedServer}
            tool={selectedTool}
            metaBinding={selectedMeta}
            discoveryRun={selectedRun}
            onDiscover={(metaToolName, opts) => {
              if (selectedServer) void handleDiscover(selectedServer.id, metaToolName, opts);
            }}
            onStop={(metaToolName) => {
              if (selectedServer) handleDiscoveryStop(selectedServer.id, metaToolName);
            }}
          />
        )}
      </div>
      <ServerFormDialog
        key={dialogFormKey}
        open={dialogMode !== null}
        mode={dialogMode ?? 'add'}
        initialValues={dialogInitial}
        onClose={handleDialogClose}
        onSubmit={handleSubmit}
        validate={dialogValidate}
      />
      <GlobalSearch
        servers={servers}
        onSelectTool={handleGlobalSelectTool}
        onSelectResource={handleGlobalSelectResource}
        onSelectPrompt={handleGlobalSelectPrompt}
      />
    </div>
  );
}
