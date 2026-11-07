import { isKeptSecret } from './secretFields';
import type { Scenario, ScenarioStep } from './scenarioRunner';

export const SCENARIO_FILE_FORMAT = 'mcp-detective-scenario' as const;
export const SCENARIO_FILE_VERSION = 1;

export interface ScenarioFileV1 {
  format: typeof SCENARIO_FILE_FORMAT;
  version: typeof SCENARIO_FILE_VERSION;
  exportedAt: number;
  scenario: Scenario;
  serverNames?: Record<string, string>;
}

export type ScenarioFileParseError =
  | { kind: 'invalid_json'; message: string }
  | { kind: 'unsupported'; message: string }
  | { kind: 'invalid_scenario'; message: string }
  | { kind: 'secret_in_args'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAssertion(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  return ['status', 'field_exists', 'field_missing', 'json_path_equals', 'contains_text'].includes(
    value.type,
  );
}

function isScenarioStep(value: unknown): value is ScenarioStep {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || typeof value.serverId !== 'string') return false;
  if (typeof value.toolName !== 'string' || !isRecord(value.args)) return false;
  if (!Array.isArray(value.assertions) || !value.assertions.every(isAssertion)) return false;
  if (value.serverName !== undefined && typeof value.serverName !== 'string') return false;
  return true;
}

export function isValidRunnableScenario(scenario: Scenario): boolean {
  if (typeof scenario.id !== 'string' || typeof scenario.name !== 'string') return false;
  if (!Array.isArray(scenario.steps)) return false;
  if (scenario.steps.length === 0) return false;
  return scenario.steps.every(
    (s) => s.toolName.trim().length > 0 && s.serverId.trim().length > 0 && isScenarioStep(s),
  );
}

function argsContainSecretMarker(value: unknown): boolean {
  if (typeof value === 'string' && isKeptSecret(value)) return true;
  if (Array.isArray(value)) return value.some(argsContainSecretMarker);
  if (isRecord(value)) return Object.values(value).some(argsContainSecretMarker);
  return false;
}

export function assertScenarioSafeToExport(scenario: Scenario): ScenarioFileParseError | null {
  for (const step of scenario.steps) {
    if (argsContainSecretMarker(step.args)) {
      return {
        kind: 'secret_in_args',
        message: `Step "${step.toolName || step.id}" still references a stored secret. Change or clear credential fields before export.`,
      };
    }
  }
  return null;
}

export function buildServerNamesMap(
  scenario: Scenario,
  servers: { id: string; name: string }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const step of scenario.steps) {
    if (!step.serverId) continue;
    const fromStep = step.serverName?.trim();
    if (fromStep) {
      map[step.serverId] = fromStep;
      continue;
    }
    const entry = servers.find((s) => s.id === step.serverId);
    if (entry) map[step.serverId] = entry.name;
  }
  return map;
}

export function enrichStepWithServerName(
  step: ScenarioStep,
  servers: { id: string; name: string }[],
): ScenarioStep {
  if (step.serverName?.trim()) return step;
  const name = servers.find((s) => s.id === step.serverId)?.name;
  return name ? { ...step, serverName: name } : step;
}

export function buildScenarioFile(
  scenario: Scenario,
  servers: { id: string; name: string }[],
): ScenarioFileV1 {
  const enriched: Scenario = {
    ...scenario,
    steps: scenario.steps.map((s) => enrichStepWithServerName(s, servers)),
  };
  return {
    format: SCENARIO_FILE_FORMAT,
    version: SCENARIO_FILE_VERSION,
    exportedAt: Date.now(),
    scenario: enriched,
    serverNames: buildServerNamesMap(enriched, servers),
  };
}

function parseBareScenario(raw: Record<string, unknown>): Scenario | null {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  if (!Array.isArray(raw.steps) || !raw.steps.every(isScenarioStep)) return null;
  return {
    id: raw.id,
    name: raw.name,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    steps: raw.steps,
  };
}

export function parseScenarioFileJson(
  text: string,
): { ok: true; file: ScenarioFileV1 } | { ok: false; error: ScenarioFileParseError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'invalid_json',
        message: err instanceof Error ? err.message : 'Invalid JSON',
      },
    };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: { kind: 'unsupported', message: 'Expected a JSON object.' } };
  }

  if (parsed.format === SCENARIO_FILE_FORMAT) {
    if (parsed.version !== SCENARIO_FILE_VERSION) {
      return {
        ok: false,
        error: {
          kind: 'unsupported',
          message: `Unsupported scenario file version ${String(parsed.version)}.`,
        },
      };
    }
    if (!isRecord(parsed.scenario)) {
      return { ok: false, error: { kind: 'invalid_scenario', message: 'Missing scenario object.' } };
    }
    const scenario = parseBareScenario(parsed.scenario);
    if (!scenario) {
      return { ok: false, error: { kind: 'invalid_scenario', message: 'Malformed scenario.' } };
    }
    if (!isValidRunnableScenario(scenario)) {
      return {
        ok: false,
        error: {
          kind: 'invalid_scenario',
          message: 'Every step needs a server and tool before import.',
        },
      };
    }
    const serverNames = isRecord(parsed.serverNames)
      ? Object.fromEntries(
          Object.entries(parsed.serverNames).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : undefined;
    return {
      ok: true,
      file: {
        format: SCENARIO_FILE_FORMAT,
        version: SCENARIO_FILE_VERSION,
        exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : Date.now(),
        scenario,
        serverNames,
      },
    };
  }

  const bare = parseBareScenario(parsed);
  if (bare) {
    if (!isValidRunnableScenario(bare)) {
      return {
        ok: false,
        error: {
          kind: 'invalid_scenario',
          message: 'Every step needs a server and tool before import.',
        },
      };
    }
    return {
      ok: true,
      file: {
        format: SCENARIO_FILE_FORMAT,
        version: SCENARIO_FILE_VERSION,
        exportedAt: Date.now(),
        scenario: bare,
      },
    };
  }

  return { ok: false, error: { kind: 'unsupported', message: 'Unrecognized scenario file.' } };
}

export function serializeScenarioFile(file: ScenarioFileV1): string {
  return JSON.stringify(file, null, 2);
}

export function resolveServerIdForStep(
  step: ScenarioStep,
  vaultServers: { id: string; name: string }[],
  serverNames: Record<string, string> | undefined,
  singleServer?: { id: string; name: string },
): string {
  if (singleServer) return singleServer.id;

  const byId = vaultServers.find((s) => s.id === step.serverId);
  if (byId) return byId.id;

  const hint = step.serverName?.trim() || serverNames?.[step.serverId];
  if (hint) {
    const exact = vaultServers.find((s) => s.id === hint || s.name === hint);
    if (exact) return exact.id;
    const lower = hint.toLowerCase();
    const fuzzy = vaultServers.find((s) => s.name.toLowerCase() === lower);
    if (fuzzy) return fuzzy.id;
  }

  throw new Error(
    `Cannot resolve server for step "${step.toolName}" (id "${step.serverId}"${hint ? `, name "${hint}"` : ''}).`,
  );
}
