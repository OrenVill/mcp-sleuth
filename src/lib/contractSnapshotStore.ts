import { getAppData, patchAppData } from './appData';
import type { ServerEntry } from '../types';
import {
  buildSnapshotFromServer,
  removeSnapshotFromStore,
  upsertSnapshotInStore,
  type ContractSnapshot,
  type ContractSnapshotsStore,
} from './contractSnapshots';

export function getContractSnapshotsStore(): ContractSnapshotsStore {
  return getAppData().contractSnapshots ?? {};
}

export function getContractSnapshotsForServer(serverId: string): ContractSnapshot[] {
  const list = getContractSnapshotsStore()[serverId] ?? [];
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

export function saveContractSnapshot(snapshot: ContractSnapshot): void {
  patchAppData({
    contractSnapshots: upsertSnapshotInStore(getContractSnapshotsStore(), snapshot),
  });
}

export function captureContractSnapshot(server: ServerEntry, label?: string): ContractSnapshot {
  const snapshot = buildSnapshotFromServer(server, label);
  saveContractSnapshot(snapshot);
  return snapshot;
}

export function deleteContractSnapshot(serverId: string, snapshotId: string): void {
  patchAppData({
    contractSnapshots: removeSnapshotFromStore(getContractSnapshotsStore(), serverId, snapshotId),
  });
}
