import { getAppData, patchAppData } from './appData';
import { createScenario, type Scenario } from './scenarioRunner';

export function getScenarios(): Scenario[] {
  return getAppData().scenarios ?? [];
}

export function setScenarios(scenarios: Scenario[]): void {
  patchAppData({ scenarios });
}

export function upsertScenario(scenario: Scenario): void {
  const list = getScenarios();
  const idx = list.findIndex((s) => s.id === scenario.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = scenario;
    setScenarios(next);
  } else {
    setScenarios([...list, scenario]);
  }
}

export function deleteScenario(scenarioId: string): void {
  setScenarios(getScenarios().filter((s) => s.id !== scenarioId));
}

export function duplicateScenario(scenarioId: string): Scenario | null {
  const source = getScenarios().find((s) => s.id === scenarioId);
  if (!source) return null;
  const copy: Scenario = {
    ...source,
    id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${source.name} (copy)`,
    createdAt: Date.now(),
    steps: source.steps.map((step) => ({
      ...step,
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 4)}`,
    })),
  };
  setScenarios([...getScenarios(), copy]);
  return copy;
}

export function renameScenario(scenarioId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const list = getScenarios();
  const idx = list.findIndex((s) => s.id === scenarioId);
  if (idx < 0) return;
  const next = [...list];
  next[idx] = { ...next[idx], name: trimmed };
  setScenarios(next);
}

export function importScenarioFromFile(scenario: Scenario): Scenario {
  const existing = getScenarios().find((s) => s.id === scenario.id);
  if (existing) {
    const fresh = { ...scenario, id: createScenario(scenario.name).id };
    setScenarios([...getScenarios(), fresh]);
    return fresh;
  }
  setScenarios([...getScenarios(), scenario]);
  return scenario;
}
