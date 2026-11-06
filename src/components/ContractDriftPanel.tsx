import { useCallback, useMemo, useState } from 'react';
import { diffServerToSnapshot, type ContractDriftReport } from '../lib/contractDrift';
import {
  captureContractSnapshot,
  getContractSnapshotsForServer,
} from '../lib/contractSnapshotStore';
import { getConnectedServers } from '../lib/serverTools';
import type { ServerEntry } from '../types';
import { Select } from './Select';

interface Props {
  servers: ServerEntry[];
  selectedServerId: string | null;
}

export function ContractDriftPanel({ servers, selectedServerId }: Props) {
  const connected = useMemo(() => getConnectedServers(servers), [servers]);
  const defaultServerId = useMemo(() => {
    if (connected.length === 0) return '';
    if (selectedServerId && connected.some((s) => s.id === selectedServerId)) {
      return selectedServerId;
    }
    return connected[0]?.id ?? '';
  }, [connected, selectedServerId]);
  const [serverId, setServerId] = useState(defaultServerId);
  const activeServerId = connected.some((s) => s.id === serverId) ? serverId : defaultServerId;
  const [refresh, setRefresh] = useState(0);
  const [snapshotLabel, setSnapshotLabel] = useState('');

  const activeServer = connected.find((s) => s.id === activeServerId) ?? null;
  const snapshots = useMemo(() => {
    void refresh;
    return activeServerId ? getContractSnapshotsForServer(activeServerId) : [];
  }, [activeServerId, refresh]);
  const baseline = snapshots[0] ?? null;

  const report = useMemo((): ContractDriftReport | null => {
    if (!activeServer || !baseline) return null;
    return diffServerToSnapshot(activeServer, baseline);
  }, [activeServer, baseline]);

  const onCapture = useCallback(() => {
    if (!activeServer) return;
    captureContractSnapshot(activeServer, snapshotLabel);
    setSnapshotLabel('');
    setRefresh((n) => n + 1);
  }, [activeServer, snapshotLabel]);

  if (!connected.length) {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-zinc-950 grid place-items-center px-8 text-center">
        <p className="text-sm text-zinc-300">Connect a server to snapshot tool contracts.</p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-zinc-950 px-5 py-5 space-y-4">
      <Select
        value={activeServerId}
        onChange={setServerId}
        options={connected.map((s) => ({ value: s.id, label: s.name }))}
        aria-label="Server"
      />
      <input
        value={snapshotLabel}
        onChange={(e) => setSnapshotLabel(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm"
        placeholder="e.g. before upgrade"
      />
      <button
        type="button"
        onClick={onCapture}
        className="px-4 py-2 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-500"
      >
        Capture snapshot
      </button>
      {snapshots.length > 0 && (
        <p className="text-sm text-zinc-400">Saved snapshots: {snapshots.length}</p>
      )}
      {report && (
        <p className="text-sm text-zinc-300">
          {report.unchangedCount} unchanged · {report.addedToolNames.length} added ·{' '}
          {report.removedToolNames.length} removed · {report.changedTools.length} changed
        </p>
      )}
    </div>
  );
}
