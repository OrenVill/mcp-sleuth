import { getAppData, patchAppData } from './appData';
import type { ServerEntry } from '../types';
import {
  ensureJournal,
  type ObservationJournal,
  type ObservationJournalsStore,
} from './observationJournal';

export function getObservationJournals(): ObservationJournalsStore {
  return getAppData().observationJournals ?? {};
}

export function getObservationJournal(server: Pick<ServerEntry, 'id' | 'name'>): ObservationJournal {
  return ensureJournal(getObservationJournals(), server);
}

export function saveObservationJournal(journal: ObservationJournal): void {
  const store = { ...getObservationJournals(), [journal.serverId]: journal };
  patchAppData({ observationJournals: store });
}

export function updateObservationJournal(
  server: Pick<ServerEntry, 'id' | 'name'>,
  updater: (journal: ObservationJournal) => ObservationJournal,
): ObservationJournal {
  const next = updater(getObservationJournal(server));
  saveObservationJournal(next);
  return next;
}
