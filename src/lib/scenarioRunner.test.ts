import { describe, expect, test } from 'vitest';
import {
  createScenario,
  addStep,
  evaluateStep,
  runScenario,
  type Scenario,
  type ScenarioStep,
  type StepAssertion,
  type StepOutcome,
} from './scenarioRunner';

function step(overrides: Partial<ScenarioStep> = {}): ScenarioStep {
  return {
    id: 'step-1',
    serverId: 'docs',
    toolName: 'search_docs',
    args: { query: 'release' },
    assertions: [],
    ...overrides,
  };
}

describe('scenarioRunner', () => {
  describe('createScenario', () => {
    test('creates scenario with generated id and empty steps', () => {
      const scenario = createScenario('My Scenario');
      expect(scenario.name).toBe('My Scenario');
      expect(scenario.id).toBeTruthy();
      expect(scenario.steps).toEqual([]);
      expect(typeof scenario.createdAt).toBe('number');
    });
  });

  describe('addStep', () => {
    test('appends a step to the scenario', () => {
      const scenario = createScenario('Test');
      const updated = addStep(scenario, step());
      expect(updated.steps).toHaveLength(1);
      expect(updated.steps[0].toolName).toBe('search_docs');
    });

    test('does not mutate the original scenario', () => {
      const scenario = createScenario('Test');
      addStep(scenario, step());
      expect(scenario.steps).toHaveLength(0);
    });
  });

  describe('evaluateStep', () => {
    test('passes when status matches expected success', () => {
      const assertions: StepAssertion[] = [{ type: 'status', expected: 'success' }];
      const outcome: StepOutcome = { status: 'success', result: { content: [] } };
      const result = evaluateStep(step({ assertions }), outcome);
      expect(result.pass).toBe(true);
      expect(result.assertionResults).toHaveLength(1);
      expect(result.assertionResults[0].pass).toBe(true);
    });

    test('fails when status is error but expected success', () => {
      const assertions: StepAssertion[] = [{ type: 'status', expected: 'success' }];
      const outcome: StepOutcome = { status: 'error', error: 'timeout' };
      const result = evaluateStep(step({ assertions }), outcome);
      expect(result.pass).toBe(false);
      expect(result.assertionResults[0].pass).toBe(false);
    });

    test('passes status=error assertion when call fails', () => {
      const assertions: StepAssertion[] = [{ type: 'status', expected: 'error' }];
      const outcome: StepOutcome = { status: 'error', error: 'not found' };
      const result = evaluateStep(step({ assertions }), outcome);
      expect(result.pass).toBe(true);
    });

    test('field_exists assertion passes when field present in result', () => {
      const assertions: StepAssertion[] = [{ type: 'field_exists', path: 'content' }];
      const outcome: StepOutcome = {
        status: 'success',
        result: { content: [{ type: 'text', text: 'hello' }] },
      };
      const result = evaluateStep(step({ assertions }), outcome);
      expect(result.assertionResults[0].pass).toBe(true);
    });

    test('field_exists assertion fails when field absent', () => {
      const assertions: StepAssertion[] = [{ type: 'field_exists', path: 'missing.field' }];
      const outcome: StepOutcome = { status: 'success', result: { content: [] } };
      const result = evaluateStep(step({ assertions }), outcome);
      expect(result.assertionResults[0].pass).toBe(false);
    });

    test('field_missing assertion passes when field absent', () => {
      const assertions: StepAssertion[] = [{ type: 'field_missing', path: 'error' }];
      const outcome: StepOutcome = { status: 'success', result: { content: [] } };
      const result = evaluateStep(step({ assertions }), outcome);
      expect(result.assertionResults[0].pass).toBe(true);
    });

    test('json_path_equals assertion passes on matching nested value', () => {
      const assertions: StepAssertion[] = [
        { type: 'json_path_equals', path: 'content.0.text', expected: 'hello world' },
      ];
      const outcome: StepOutcome = {
        status: 'success',
        result: { content: [{ type: 'text', text: 'hello world' }] },
      };
      const result = evaluateStep(step({ assertions }), outcome);
      expect(result.assertionResults[0].pass).toBe(true);
    });

    test('json_path_equals assertion fails on mismatched value', () => {
      const assertions: StepAssertion[] = [
        { type: 'json_path_equals', path: 'content.0.text', expected: 'hello world' },
      ];
      const outcome: StepOutcome = {
        status: 'success',
        result: { content: [{ type: 'text', text: 'goodbye' }] },
      };
      const result = evaluateStep(step({ assertions }), outcome);
      expect(result.assertionResults[0].pass).toBe(false);
      expect(result.assertionResults[0].actual).toBe('goodbye');
      expect(result.assertionResults[0].expected).toBe('hello world');
    });

    test('contains_text assertion passes when result serialises to include text', () => {
      const assertions: StepAssertion[] = [
        { type: 'contains_text', text: 'release notes' },
      ];
      const outcome: StepOutcome = {
        status: 'success',
        result: { content: [{ type: 'text', text: 'see release notes for details' }] },
      };
      const result = evaluateStep(step({ assertions }), outcome);
      expect(result.assertionResults[0].pass).toBe(true);
    });

    test('contains_text assertion fails when text absent', () => {
      const assertions: StepAssertion[] = [{ type: 'contains_text', text: 'missing text' }];
      const outcome: StepOutcome = {
        status: 'success',
        result: { content: [{ type: 'text', text: 'something else' }] },
      };
      const result = evaluateStep(step({ assertions }), outcome);
      expect(result.assertionResults[0].pass).toBe(false);
    });

    test('step with no assertions always passes', () => {
      const outcome: StepOutcome = { status: 'success', result: {} };
      const result = evaluateStep(step({ assertions: [] }), outcome);
      expect(result.pass).toBe(true);
      expect(result.assertionResults).toHaveLength(0);
    });
  });

  describe('runScenario', () => {
    test('runs all steps sequentially and aggregates results', async () => {
      const s: Scenario = {
        id: 'sc-1',
        name: 'Smoke',
        createdAt: 0,
        steps: [
          step({ id: 'step-1', assertions: [{ type: 'status', expected: 'success' }] }),
          step({
            id: 'step-2',
            toolName: 'list_docs',
            args: {},
            assertions: [{ type: 'field_exists', path: 'content' }],
          }),
        ],
      };

      const run = await runScenario(s, async (stepDef) => {
        if (stepDef.toolName === 'search_docs') {
          return { status: 'success', result: { content: [] } };
        }
        return { status: 'success', result: { content: [{ type: 'text', text: 'ok' }] } };
      });

      expect(run.stepResults).toHaveLength(2);
      expect(run.passCount).toBe(2);
      expect(run.failCount).toBe(0);
      expect(run.status).toBe('pass');
    });

    test('reports failed steps without stopping the run', async () => {
      const s: Scenario = {
        id: 'sc-2',
        name: 'Mixed',
        createdAt: 0,
        steps: [
          step({ id: 'step-1', assertions: [{ type: 'status', expected: 'success' }] }),
          step({ id: 'step-2', assertions: [{ type: 'status', expected: 'error' }] }),
        ],
      };

      const run = await runScenario(s, async () => ({
        status: 'success',
        result: {},
      }));

      expect(run.passCount).toBe(1);
      expect(run.failCount).toBe(1);
      expect(run.status).toBe('fail');
    });

    test('catches thrown errors and marks step as failed', async () => {
      const s: Scenario = {
        id: 'sc-3',
        name: 'Error',
        createdAt: 0,
        steps: [step({ id: 'step-1', assertions: [] })],
      };

      const run = await runScenario(s, async () => {
        throw new Error('network failure');
      });

      expect(run.stepResults[0].pass).toBe(false);
      expect(run.stepResults[0].error).toBe('network failure');
      expect(run.status).toBe('fail');
    });
  });
});
