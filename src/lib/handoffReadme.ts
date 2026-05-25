import type { ServerEntry, ToolDef, JsonSchema, JsonSchemaProperty } from '../types';
import type { CallRecord } from './history';
import type { ReplaySuite } from './replaySuites';
import { analyzeAgentReadiness } from './agentReadiness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandoffReadmeOptions {
  /** Include a section with the full JSON input schema for each tool. */
  includeSchemas?: boolean;
  /** Include an Agent Readiness score section. */
  includeReadiness?: boolean;
  /** Include example invocations drawn from call history. */
  includeExamples?: boolean;
  /** Include replay suites section. */
  includeReplaySuites?: boolean;
  /** Max number of example records to include per tool (default 3). */
  maxExamplesPerTool?: number;
}

export interface HandoffReadmeInput {
  server: ServerEntry;
  /** Call history records for this server (optional). */
  history?: CallRecord[];
  /** Replay suites to include (optional). */
  replaySuites?: ReplaySuite[];
  options: HandoffReadmeOptions;
}

// ---------------------------------------------------------------------------
// Sensitive-key heuristics for redaction
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_PATTERNS = [
  /key/i,
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /credential/i,
  /auth/i,
  /bearer/i,
  /api[-_]?key/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = isSensitiveKey(k) ? '[REDACTED]' : v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

function getTypeString(prop: JsonSchemaProperty): string {
  if (!prop.type) return 'any';
  if (Array.isArray(prop.type)) return prop.type.join(' | ');
  return prop.type;
}

function renderParamsTable(schema: JsonSchema): string {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const keys = Object.keys(props);
  if (keys.length === 0) return '_No parameters_\n';

  const rows = keys.map((key) => {
    const prop = props[key];
    const type = getTypeString(prop);
    const req = required.has(key) ? 'yes' : 'no';
    const desc = prop.description ?? '';
    return `| ${key} | ${type} | ${req} | ${desc} |`;
  });

  return [
    '| Name | Type | Required | Description |',
    '|------|------|----------|-------------|',
    ...rows,
  ].join('\n') + '\n';
}

function renderTool(tool: ToolDef, includeSchema: boolean): string {
  const lines: string[] = [];
  lines.push(`### ${tool.name}`);

  if (tool.description) {
    lines.push('');
    lines.push(tool.description);
  }

  lines.push('');
  lines.push('**Parameters:**');
  lines.push('');
  lines.push(renderParamsTable(tool.inputSchema));

  if (includeSchema) {
    lines.push('');
    lines.push('<details><summary>Full JSON Schema</summary>');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(tool.inputSchema, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('</details>');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderReadinessSection(server: ServerEntry): string {
  const report = analyzeAgentReadiness([server], []);
  const lines: string[] = [];
  lines.push('## Agent Readiness');
  lines.push('');
  lines.push(`**Score:** ${report.score}/100 — ${report.verdict}`);
  lines.push('');
  lines.push(
    `${report.toolCount} tools analysed · ${report.readyToolCount} ready · ` +
    `${report.criticalCount} critical issues · ${report.highCount} high issues`,
  );

  if (report.issues.length > 0) {
    lines.push('');
    lines.push('### Issues');
    for (const issue of report.issues.slice(0, 10)) {
      const tool = issue.toolName ? ` (\`${issue.toolName}\`)` : '';
      lines.push(`- **[${issue.severity.toUpperCase()}]**${tool} ${issue.message}`);
    }
    if (report.issues.length > 10) {
      lines.push(`- … and ${report.issues.length - 10} more.`);
    }
  }

  if (report.quickWins.length > 0) {
    lines.push('');
    lines.push('### Quick Wins');
    for (const qw of report.quickWins) {
      lines.push(`- ${qw}`);
    }
  }

  return lines.join('\n');
}

function renderExamplesSection(
  history: CallRecord[],
  options: HandoffReadmeOptions,
): string {
  const max = options.maxExamplesPerTool ?? 3;
  const byTool = new Map<string, CallRecord[]>();
  for (const record of history) {
    const list = byTool.get(record.toolName) ?? [];
    list.push(record);
    byTool.set(record.toolName, list);
  }

  const lines: string[] = [];
  lines.push('## Examples');
  lines.push('');
  lines.push('_Drawn from recent call history. Sensitive arguments are redacted._');

  for (const [toolName, records] of byTool.entries()) {
    lines.push('');
    lines.push(`### \`${toolName}\``);
    for (const record of records.slice(0, max)) {
      const safeArgs = redactArgs(record.args);
      lines.push('');
      lines.push('**Args:**');
      lines.push('```json');
      lines.push(JSON.stringify(safeArgs, null, 2));
      lines.push('```');
    }
  }

  return lines.join('\n');
}

function renderReplaySuitesSection(suites: ReplaySuite[]): string {
  const lines: string[] = [];
  lines.push('## Replay Suites');
  lines.push('');
  lines.push('_These suites can be imported and executed in MCP Explorer._');

  for (const suite of suites) {
    lines.push('');
    lines.push(`### ${suite.name}`);
    lines.push('');
    lines.push(`${suite.cases.length} case(s)`);

    for (const c of suite.cases) {
      lines.push('');
      lines.push(`- \`${c.toolName}\` — args: \`${JSON.stringify(c.args)}\``);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

/**
 * Generate a Markdown handoff README from a server's metadata, tools, readiness
 * report, call history, and replay suites.
 */
export function generateHandoffReadme(input: HandoffReadmeInput): string {
  const { server, options } = input;
  const includeSchemas = options.includeSchemas ?? false;
  const includeReadiness = options.includeReadiness ?? false;
  const includeExamples = options.includeExamples ?? false;
  const includeReplaySuites = options.includeReplaySuites ?? false;

  const sections: string[] = [];

  // Title + meta
  sections.push(`# ${server.name}`);

  if (server.description) {
    sections.push('');
    sections.push(server.description);
  }

  sections.push('');
  sections.push(`**URL:** ${server.url}`);

  if (server.auth && server.auth.method !== 'none') {
    sections.push('');
    sections.push(`**Auth:** ${server.auth.method}`);
  }

  // Tools
  const allTools = [...(server.tools ?? []), ...(server.discovered ?? [])];
  sections.push('');
  sections.push(`## Tools (${allTools.length})`);

  if (allTools.length === 0) {
    sections.push('');
    sections.push('_No tools discovered._');
  } else {
    for (const tool of allTools) {
      sections.push('');
      sections.push(renderTool(tool, includeSchemas));
    }
  }

  // Agent Readiness
  if (includeReadiness) {
    sections.push('');
    sections.push(renderReadinessSection(server));
  }

  // Examples
  if (includeExamples && input.history && input.history.length > 0) {
    sections.push('');
    sections.push(renderExamplesSection(input.history, options));
  }

  // Replay Suites
  if (includeReplaySuites && input.replaySuites && input.replaySuites.length > 0) {
    sections.push('');
    sections.push(renderReplaySuitesSection(input.replaySuites));
  }

  return sections.join('\n') + '\n';
}
