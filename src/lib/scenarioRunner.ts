// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssertionType =
  | 'status'
  | 'field_exists'
  | 'field_missing'
  | 'json_path_equals'
  | 'contains_text';

export interface StatusAssertion {
  type: 'status';
  expected: 'success' | 'error';
}

export interface FieldExistsAssertion {
  type: 'field_exists';
  path: string;
}

export interface FieldMissingAssertion {
  type: 'field_missing';
  path: string;
}

export interface JsonPathEqualsAssertion {
  type: 'json_path_equals';
  path: string;
  expected: unknown;
}

export interface ContainsTextAssertion {
  type: 'contains_text';
  text: string;
}

export type StepAssertion =
  | StatusAssertion
  | FieldExistsAssertion
  | FieldMissingAssertion
  | JsonPathEqualsAssertion
  | ContainsTextAssertion;

export interface ScenarioStep {
  id: string;
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
  assertions: StepAssertion[];
}

export interface Scenario {
  id: string;
  name: string;
  createdAt: number;
  steps: ScenarioStep[];
}

export interface StepOutcome {
  status: 'success' | 'error';
  result?: unknown;
  error?: string;
  durationMs?: number;
}

export interface AssertionResult {
  type: AssertionType;
  pass: boolean;
  message?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface StepResult {
  stepId: string;
  pass: boolean;
  assertionResults: AssertionResult[];
  durationMs?: number;
  error?: string;
}

export interface ScenarioRun {
  scenarioId: string;
  scenarioName: string;
  status: 'pass' | 'fail';
  passCount: number;
  failCount: number;
  stepResults: StepResult[];
  startedAt: number;
  finishedAt: number;
}

// ---------------------------------------------------------------------------
// Path resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-notation path through a plain object/array.
 * Returns { found: true, value } or { found: false }.
 */
function resolvePath(
  root: unknown,
  path: string,
): { found: true; value: unknown } | { found: false } {
  const parts = path.split('.');
  let current: unknown = root;

  for (const part of parts) {
    if (current === null || current === undefined) return { found: false };

    if (Array.isArray(current)) {
      const idx = parseInt(part, 10);
      if (isNaN(idx)) return { found: false };
      current = current[idx];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return { found: false };
    }
  }

  return { found: true, value: current };
}

// ---------------------------------------------------------------------------
// Assertion evaluator
// ---------------------------------------------------------------------------

function evaluateAssertion(
  assertion: StepAssertion,
  outcome: StepOutcome,
): AssertionResult {
  switch (assertion.type) {
    case 'status': {
      const actual = outcome.status;
      const pass = actual === assertion.expected;
      return {
        type: 'status',
        pass,
        expected: assertion.expected,
        actual,
        message: pass
          ? `Status is ${actual}`
          : `Expected status "${assertion.expected}" but got "${actual}"`,
      };
    }

    case 'field_exists': {
      const resolved = resolvePath(outcome.result, assertion.path);
      const pass = resolved.found && resolved.value !== undefined;
      return {
        type: 'field_exists',
        pass,
        message: pass
          ? `Field "${assertion.path}" exists`
          : `Field "${assertion.path}" not found`,
      };
    }

    case 'field_missing': {
      const resolved = resolvePath(outcome.result, assertion.path);
      const pass = !resolved.found || resolved.value === undefined;
      return {
        type: 'field_missing',
        pass,
        message: pass
          ? `Field "${assertion.path}" is absent`
          : `Expected field "${assertion.path}" to be absent but it was present`,
      };
    }

    case 'json_path_equals': {
      const resolved = resolvePath(outcome.result, assertion.path);
      if (!resolved.found) {
        return {
          type: 'json_path_equals',
          pass: false,
          expected: assertion.expected,
          actual: undefined,
          message: `Path "${assertion.path}" not found`,
        };
      }
      const actual = resolved.value;
      const pass =
        JSON.stringify(actual) === JSON.stringify(assertion.expected);
      return {
        type: 'json_path_equals',
        pass,
        expected: assertion.expected,
        actual,
        message: pass
          ? `"${assertion.path}" equals expected value`
          : `"${assertion.path}" expected ${JSON.stringify(assertion.expected)} but got ${JSON.stringify(actual)}`,
      };
    }

    case 'contains_text': {
      const serialized = JSON.stringify(outcome.result ?? '');
      const pass = serialized.includes(assertion.text);
      return {
        type: 'contains_text',
        pass,
        message: pass
          ? `Result contains "${assertion.text}"`
          : `Result does not contain "${assertion.text}"`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a new empty scenario. */
export function createScenario(name: string): Scenario {
  return {
    id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    createdAt: Date.now(),
    steps: [],
  };
}

/** Return a new scenario with `newStep` appended (immutable). */
export function addStep(scenario: Scenario, newStep: ScenarioStep): Scenario {
  return { ...scenario, steps: [...scenario.steps, newStep] };
}

/** Evaluate a single step's outcome against its assertions. */
export function evaluateStep(
  stepDef: ScenarioStep,
  outcome: StepOutcome,
): StepResult {
  const assertionResults = stepDef.assertions.map((a) =>
    evaluateAssertion(a, outcome),
  );
  const pass = assertionResults.every((r) => r.pass);

  return {
    stepId: stepDef.id,
    pass,
    assertionResults,
    durationMs: outcome.durationMs,
  };
}

/**
 * Run all steps of a scenario sequentially.
 * `caller` is responsible for invoking the tool and returning an outcome.
 * Thrown errors are caught and represented as failed steps.
 */
export async function runScenario(
  scenario: Scenario,
  caller: (step: ScenarioStep) => Promise<StepOutcome>,
): Promise<ScenarioRun> {
  const startedAt = Date.now();
  const stepResults: StepResult[] = [];

  for (const stepDef of scenario.steps) {
    try {
      const outcome = await caller(stepDef);
      stepResults.push(evaluateStep(stepDef, outcome));
    } catch (err) {
      stepResults.push({
        stepId: stepDef.id,
        pass: false,
        assertionResults: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passCount = stepResults.filter((r) => r.pass).length;
  const failCount = stepResults.length - passCount;

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    status: failCount === 0 ? 'pass' : 'fail',
    passCount,
    failCount,
    stepResults,
    startedAt,
    finishedAt: Date.now(),
  };
}
