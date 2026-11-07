import { describe, expect, test } from 'vitest';
import { keepMarker } from './secretFields';
import {
  buildScenarioFile,
  parseScenarioFileJson,
  assertScenarioSafeToExport,
  resolveServerIdForStep,
  type ScenarioFileV1,
} from './scenarioFile';
import { createScenario, addStep, type ScenarioStep } from './scenarioRunner';

const step = (overrides: Partial<ScenarioStep> = {}): ScenarioStep => ({
  id: 'step-1',
  serverId: 'srv-a',
  serverName: 'Fixture',
  toolName: 'echo',
  args: { message: 'hi' },
  assertions: [{ type: 'status', expected: 'success' }],
  ...overrides,
});

describe('scenarioFile', () => {
  test('parseScenarioFileJson accepts wrapped v1 file', () => {
    const scenario = addStep(createScenario('Test'), step());
    const file: ScenarioFileV1 = buildScenarioFile(scenario, [{ id: 'srv-a', name: 'Fixture' }]);
    const result = parseScenarioFileJson(JSON.stringify(file));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.scenario.name).toBe('Test');
      expect(result.file.serverNames?.['srv-a']).toBe('Fixture');
    }
  });

  test('parseScenarioFileJson accepts bare scenario object', () => {
    const scenario = addStep(createScenario('Bare'), step());
    const result = parseScenarioFileJson(JSON.stringify(scenario));
    expect(result.ok).toBe(true);
  });

  test('rejects steps without tool selection', () => {
    const scenario = createScenario('Empty tool');
    scenario.steps.push({ ...step(), toolName: '', serverId: '' });
    const result = parseScenarioFileJson(JSON.stringify(scenario));
    expect(result.ok).toBe(false);
  });

  test('assertScenarioSafeToExport blocks secret markers', () => {
    const scenario = addStep(createScenario('Secret'), step({ args: { token: keepMarker('k') } }));
    expect(assertScenarioSafeToExport(scenario)?.kind).toBe('secret_in_args');
  });

  test('resolveServerIdForStep uses serverNames when id missing from vault', () => {
    const vault = [{ id: 'live-id', name: 'Fixture' }];
    const id = resolveServerIdForStep(
      step({ serverId: 'old-id' }),
      vault,
      { 'old-id': 'Fixture' },
    );
    expect(id).toBe('live-id');
  });

  test('--server remap uses single server id', () => {
    const id = resolveServerIdForStep(step(), [{ id: 'x', name: 'Other' }], undefined, {
      id: 'pinned',
      name: 'Pinned',
    });
    expect(id).toBe('pinned');
  });
});
