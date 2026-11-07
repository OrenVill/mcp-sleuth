import { beforeEach, describe, expect, it } from 'vitest';
import { _resetCache, _seedCache } from './appData';
import {
  deleteScenario,
  duplicateScenario,
  getScenarios,
  importScenarioFromFile,
  setScenarios,
  upsertScenario,
} from './scenarioStore';
import { createScenario } from './scenarioRunner';

describe('scenarioStore', () => {
  beforeEach(() => {
    _resetCache();
    _seedCache({
      version: 3,
      bookmarks: [],
      history: [],
      observationJournals: {},
      agentRuns: {},
      scenarios: [],
    });
  });

  it('upsert and delete scenarios', () => {
    const s = createScenario('One');
    upsertScenario(s);
    expect(getScenarios()).toHaveLength(1);
    deleteScenario(s.id);
    expect(getScenarios()).toHaveLength(0);
  });

  it('duplicateScenario assigns new ids', () => {
    const s = createScenario('Orig');
    setScenarios([s]);
    const copy = duplicateScenario(s.id);
    expect(copy).not.toBeNull();
    expect(getScenarios()).toHaveLength(2);
    expect(copy!.id).not.toBe(s.id);
  });

  it('importScenarioFromFile avoids id collision', () => {
    const s = createScenario('Dup');
    setScenarios([s]);
    const imported = importScenarioFromFile({ ...s, name: 'Dup import' });
    expect(imported.id).not.toBe(s.id);
    expect(getScenarios()).toHaveLength(2);
  });
});
