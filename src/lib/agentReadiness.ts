import type { ServerEntry, ToolDef } from '../types';
import type { ProtocolTraceEvent } from './protocolTrace';

export type AgentReadinessSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AgentReadinessVerdict = 'excellent' | 'agent-ready' | 'needs-work' | 'not-ready';

export interface AgentReadinessIssue {
  id: string;
  severity: AgentReadinessSeverity;
  message: string;
  recommendation: string;
  serverId: string;
  serverName: string;
  toolName?: string;
  path?: string;
}

export interface AgentReadinessToolReport {
  serverId: string;
  serverName: string;
  toolName: string;
  score: number;
  verdict: AgentReadinessVerdict;
  issues: AgentReadinessIssue[];
}

export interface AgentReadinessReport {
  score: number;
  verdict: AgentReadinessVerdict;
  toolCount: number;
  readyToolCount: number;
  criticalCount: number;
  highCount: number;
  issues: AgentReadinessIssue[];
  tools: AgentReadinessToolReport[];
  quickWins: string[];
}

const PENALTIES: Record<AgentReadinessSeverity, number> = {
  critical: 35,
  high: 16,
  medium: 8,
  low: 3,
};

const GENERIC_TOOL_NAMES = new Set([
  'call',
  'do',
  'execute',
  'get',
  'invoke',
  'list',
  'query',
  'read',
  'run',
  'search',
  'tool',
  'write',
]);

const GENERIC_PARAM_NAMES = new Set(['q', 'arg', 'args', 'data', 'input', 'payload', 'params', 'value']);

export function analyzeAgentReadiness(
  servers: ServerEntry[],
  traces: ProtocolTraceEvent[] = [],
): AgentReadinessReport {
  const connectedServers = servers.filter((server) => server.status === 'connected');
  const tools = connectedServers.flatMap((server) =>
    getAllTools(server).map((tool) => analyzeToolReadiness(tool, server, traces)),
  );
  const issues = tools.flatMap((tool) => tool.issues).sort(compareIssues);
  const score = tools.length === 0
    ? 0
    : Math.round(tools.reduce((sum, tool) => sum + tool.score, 0) / tools.length);
  const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
  const highCount = issues.filter((issue) => issue.severity === 'high').length;

  return {
    score,
    verdict: verdictFor(score, criticalCount),
    toolCount: tools.length,
    readyToolCount: tools.filter((tool) => isReadyVerdict(tool.verdict)).length,
    criticalCount,
    highCount,
    issues,
    tools,
    quickWins: quickWinsFor(issues),
  };
}

export function analyzeToolReadiness(
  tool: ToolDef,
  server: Pick<ServerEntry, 'id' | 'name'> = { id: 'server', name: 'Server' },
  traces: ProtocolTraceEvent[] = [],
): AgentReadinessToolReport {
  const context = {
    serverId: server.id,
    serverName: server.name,
    toolName: tool.name,
  };
  const issues: AgentReadinessIssue[] = [
    ...toolMetadataIssues(tool, context),
    ...schemaIssues(tool, context),
    ...traceIssues(tool, context, traces),
  ].sort(compareIssues);
  const score = scoreFor(issues);

  return {
    serverId: server.id,
    serverName: server.name,
    toolName: tool.name,
    score,
    verdict: verdictFor(score, issues.filter((issue) => issue.severity === 'critical').length),
    issues,
  };
}

export function readinessLabel(verdict: AgentReadinessVerdict): string {
  switch (verdict) {
    case 'excellent':
      return 'Excellent';
    case 'agent-ready':
      return 'Agent ready';
    case 'needs-work':
      return 'Needs work';
    case 'not-ready':
      return 'Not ready';
  }
}

function getAllTools(server: ServerEntry): ToolDef[] {
  const nativeTools = server.tools ?? [];
  const nativeNames = new Set(nativeTools.map((tool) => tool.name));
  const discoveredTools = (server.discovered ?? []).filter((tool) => !nativeNames.has(tool.name));

  return [...nativeTools, ...discoveredTools];
}

function toolMetadataIssues(
  tool: ToolDef,
  context: Pick<AgentReadinessIssue, 'serverId' | 'serverName' | 'toolName'>,
): AgentReadinessIssue[] {
  const issues: AgentReadinessIssue[] = [];
  const name = tool.name.trim();
  const description = (tool.description ?? '').trim();

  if (GENERIC_TOOL_NAMES.has(name.toLowerCase()) || !hasDescriptiveNameShape(name)) {
    issues.push(issue(context, {
      id: 'tool-name-generic',
      severity: 'high',
      message: `Tool "${tool.name}" has a generic or ambiguous name.`,
      recommendation: 'Use a verb_noun name that describes the task, such as search_docs or create_issue.',
    }));
  }

  if (description.length === 0) {
    issues.push(issue(context, {
      id: 'tool-description-missing',
      severity: 'high',
      message: `Tool "${tool.name}" does not include a description.`,
      recommendation: 'Describe when an agent should use this tool and what result it returns.',
    }));
  } else if (description.length < 24) {
    issues.push(issue(context, {
      id: 'tool-description-thin',
      severity: 'medium',
      message: `Tool "${tool.name}" has a very short description.`,
      recommendation: 'Add enough context for an agent to choose this tool without guessing.',
    }));
  }

  return issues;
}

function hasDescriptiveNameShape(name: string): boolean {
  if (name.length < 5) return false;
  if (/[_-]/.test(name)) return true;
  if (/[a-z][A-Z]/.test(name)) return true;
  return !GENERIC_TOOL_NAMES.has(name.toLowerCase());
}

function schemaIssues(
  tool: ToolDef,
  context: Pick<AgentReadinessIssue, 'serverId' | 'serverName' | 'toolName'>,
): AgentReadinessIssue[] {
  const issues: AgentReadinessIssue[] = [];
  const schema = tool.inputSchema;
  const rootType = getSchemaType(schema, 'object');
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  if (rootType !== 'object') {
    issues.push(issue(context, {
      id: 'schema-root-not-object',
      severity: 'critical',
      message: `Input schema root type is "${rootType}" instead of "object".`,
      recommendation: 'Expose tool arguments as an object schema with named properties.',
    }));
  }

  for (const field of required) {
    if (!(field in properties)) {
      issues.push(issue(context, {
        id: 'required-field-missing-property',
        severity: 'critical',
        path: field,
        message: `Required field "${field}" is not defined in properties.`,
        recommendation: 'Add the field to inputSchema.properties or remove it from required.',
      }));
    }
  }

  const propertyIssues = Object.entries(properties).flatMap(([name, property]) =>
    parameterIssues(name, property, required.has(name), context),
  );

  return [...issues, ...dedupePerTool(propertyIssues)];
}

function parameterIssues(
  name: string,
  property: Record<string, unknown>,
  required: boolean,
  context: Pick<AgentReadinessIssue, 'serverId' | 'serverName' | 'toolName'>,
): AgentReadinessIssue[] {
  const issues: AgentReadinessIssue[] = [];
  const type = getSchemaType(property, 'string');
  const description = typeof property.description === 'string' ? property.description.trim() : '';

  if (description.length === 0) {
    issues.push(issue(context, {
      id: 'parameter-description-missing',
      severity: required ? 'high' : 'medium',
      path: name,
      message: `Parameter "${name}" has no description.`,
      recommendation: 'Explain what the parameter controls and how an agent should choose a value.',
    }));
  }

  if (
    type === 'string' &&
    property.enum === undefined &&
    property.default === undefined &&
    (GENERIC_PARAM_NAMES.has(name.toLowerCase()) || description.length === 0)
  ) {
    issues.push(issue(context, {
      id: 'broad-string-without-enum',
      severity: 'medium',
      path: name,
      message: `String parameter "${name}" is broad and has no enum or default.`,
      recommendation: 'Prefer a descriptive name, examples/defaults, or an enum for constrained choices.',
    }));
  }

  if (type === 'object' || type === 'array') {
    issues.push(issue(context, {
      id: 'complex-schema-simplified',
      severity: 'medium',
      path: name,
      message: `Parameter "${name}" is ${type}-shaped and may be harder for agents to fill correctly.`,
      recommendation: 'Keep nested schemas shallow and document the expected JSON shape with examples.',
    }));
  }

  for (const composition of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (property[composition] !== undefined) {
      issues.push(issue(context, {
        id: 'schema-composition-ambiguous',
        severity: 'medium',
        path: name,
        message: `Parameter "${name}" uses ${composition}, which can be ambiguous for generated forms and agents.`,
        recommendation: 'Prefer explicit fields or an enum discriminator when possible.',
      }));
    }
  }

  return issues;
}

function traceIssues(
  tool: ToolDef,
  context: Pick<AgentReadinessIssue, 'serverId' | 'serverName' | 'toolName'>,
  traces: ProtocolTraceEvent[],
): AgentReadinessIssue[] {
  const relevant = traces.filter((trace) => trace.serverId === context.serverId && toolNameFromTrace(trace) === tool.name);
  const issues: AgentReadinessIssue[] = [];

  if (relevant.some((trace) => trace.status === 'ok' && isPlainTextToolResult(trace.result))) {
    issues.push(issue(context, {
      id: 'unstructured-text-result',
      severity: 'medium',
      message: `Recent successful calls to "${tool.name}" returned plain text content.`,
      recommendation: 'Prefer stable structured JSON content for results agents need to inspect or compare.',
    }));
  }

  if (relevant.some((trace) => trace.status === 'error' && isUnclearError(trace.error))) {
    issues.push(issue(context, {
      id: 'unclear-error-message',
      severity: 'medium',
      message: `Recent failed calls to "${tool.name}" returned unclear error messages.`,
      recommendation: 'Return actionable errors that identify the bad field and suggest a recovery step.',
    }));
  }

  return issues;
}

function issue(
  context: Pick<AgentReadinessIssue, 'serverId' | 'serverName' | 'toolName'>,
  details: Pick<AgentReadinessIssue, 'id' | 'severity' | 'message' | 'recommendation' | 'path'>,
): AgentReadinessIssue {
  return { ...context, ...details };
}

function dedupePerTool(issues: AgentReadinessIssue[]): AgentReadinessIssue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    if (!['parameter-description-missing', 'broad-string-without-enum'].includes(item.id)) return true;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function scoreFor(issues: AgentReadinessIssue[]): number {
  return Math.max(
    0,
    100 - issues.reduce((total, item) => total + PENALTIES[item.severity], 0),
  );
}

function verdictFor(score: number, criticalCount: number): AgentReadinessVerdict {
  if (criticalCount > 0 || score < 50) return 'not-ready';
  if (score < 70) return 'needs-work';
  if (score < 90) return 'agent-ready';
  return 'excellent';
}

function isReadyVerdict(verdict: AgentReadinessVerdict): boolean {
  return verdict === 'excellent' || verdict === 'agent-ready';
}

function quickWinsFor(issues: AgentReadinessIssue[]): string[] {
  const quickWins: string[] = [];
  const ids = new Set(issues.map((issue) => issue.id));

  if (ids.has('tool-description-missing') || ids.has('parameter-description-missing')) {
    quickWins.push('Add tool and parameter descriptions so agents can choose tools and arguments without guessing.');
  }
  if (ids.has('tool-name-generic')) {
    quickWins.push('Rename generic tools to explicit verb_noun names such as search_docs or create_issue.');
  }
  if (ids.has('broad-string-without-enum')) {
    quickWins.push('Constrain broad string parameters with enums, defaults, examples, or clearer names.');
  }
  if (ids.has('complex-schema-simplified') || ids.has('schema-composition-ambiguous')) {
    quickWins.push('Simplify deeply structured inputs or document the exact JSON shape with examples.');
  }
  if (ids.has('unstructured-text-result') || ids.has('unclear-error-message')) {
    quickWins.push('Use structured outputs and actionable error messages for easier agent recovery.');
  }

  return quickWins;
}

function compareIssues(a: AgentReadinessIssue, b: AgentReadinessIssue): number {
  const severityOrder: Record<AgentReadinessSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return severityOrder[a.severity] - severityOrder[b.severity] ||
    (a.toolName ?? '').localeCompare(b.toolName ?? '') ||
    a.id.localeCompare(b.id);
}

function getSchemaType(schema: { type?: unknown }, defaultType: string): string {
  if (Array.isArray(schema.type)) {
    return schema.type.find((type): type is string => typeof type === 'string' && type !== 'null') ?? defaultType;
  }

  return typeof schema.type === 'string' ? schema.type : defaultType;
}

function toolNameFromTrace(trace: ProtocolTraceEvent): string | null {
  if (trace.method !== 'tools/call') return null;
  const params = trace.params;
  if (!params || typeof params !== 'object') return null;
  const name = (params as { name?: unknown }).name;
  return typeof name === 'string' ? name : null;
}

function isPlainTextToolResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) return false;

  return content.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const record = item as { type?: unknown; text?: unknown };
    return record.type === 'text' && typeof record.text === 'string' && !looksLikeJson(record.text);
  });
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function isUnclearError(error: unknown): boolean {
  if (typeof error !== 'string') return false;
  const normalized = error.trim().toLowerCase();
  return normalized.length < 12 || ['bad', 'error', 'failed', 'invalid'].includes(normalized);
}
