import type { ServerEntry, ToolDef, JsonSchemaProperty } from '../types';
import { getAllTools, getConnectedServers } from './serverTools';

export type InjectionFindingLocation =
  | 'tool_name'
  | 'tool_description'
  | 'parameter_name'
  | 'parameter_description';

export interface PromptInjectionFinding {
  serverId: string;
  serverName: string;
  toolName: string;
  location: InjectionFindingLocation;
  path?: string;
  patternId: string;
  patternLabel: string;
  severity: 'high' | 'medium' | 'low';
  matchedText: string;
  context: string;
}

export interface PromptInjectionReport {
  findings: PromptInjectionFinding[];
  scannedToolCount: number;
}

export interface HighlightPart {
  text: string;
  highlight: boolean;
}

const INJECTION_PATTERNS: Array<{
  id: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
  re: RegExp;
}> = [
  {
    id: 'override-instruction',
    label: 'Instruction override attempt',
    severity: 'high',
    re: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  },
  {
    id: 'disregard-safety',
    label: 'Safety disregard language',
    severity: 'high',
    re: /disregard\s+(safety|policy|rules|guidelines)/gi,
  },
  {
    id: 'role-hijack',
    label: 'Role / mode hijack',
    severity: 'high',
    re: /you\s+are\s+now\s+(in\s+)?(developer|admin|god|unrestricted)\s+mode/gi,
  },
  {
    id: 'system-prompt',
    label: 'Embedded system prompt',
    severity: 'high',
    re: /<\s*\/?\s*system\s*>|system\s+prompt\s*:/gi,
  },
  {
    id: 'must-comply',
    label: 'Forced compliance phrasing',
    severity: 'medium',
    re: /\b(you\s+must|always\s+obey|do\s+not\s+refuse|never\s+say\s+no)\b/gi,
  },
  {
    id: 'secret-exfil',
    label: 'Secret exfiltration hint',
    severity: 'medium',
    re: /\b(reveal|leak|exfiltrate|dump).{0,30}(secret|password|token|key)\b/gi,
  },
  {
    id: 'hidden-instruction',
    label: 'Hidden instruction delimiter',
    severity: 'medium',
    re: /\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/g,
  },
];

const UNICODE_ANOMALY =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]|[\uD800-\uDBFF][\uDC00-\uDFFF]/;

function walkProperties(
  props: Record<string, JsonSchemaProperty> | undefined,
  prefix: string,
  onField: (name: string, prop: JsonSchemaProperty, path: string) => void,
): void {
  if (!props) return;
  for (const [name, prop] of Object.entries(props)) {
    const path = prefix ? `${prefix}.${name}` : name;
    onField(name, prop, path);
    if (prop.properties) walkProperties(prop.properties, path, onField);
    if (prop.items?.properties) walkProperties(prop.items.properties, `${path}[]`, onField);
  }
}

function scanField(
  text: string,
  ctx: Pick<PromptInjectionFinding, 'serverId' | 'serverName' | 'toolName' | 'location' | 'path'>,
): PromptInjectionFinding[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const findings: PromptInjectionFinding[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match = pattern.re.exec(trimmed);
    while (match) {
      findings.push({
        ...ctx,
        patternId: pattern.id,
        patternLabel: pattern.label,
        severity: pattern.severity,
        matchedText: match[0],
        context: trimmed,
      });
      match = pattern.re.exec(trimmed);
    }
  }

  if (UNICODE_ANOMALY.test(trimmed)) {
    const m = trimmed.match(UNICODE_ANOMALY);
    findings.push({
      ...ctx,
      patternId: 'unicode-anomaly',
      patternLabel: 'Unusual Unicode (zero-width / bidi / surrogate)',
      severity: 'medium',
      matchedText: m?.[0] ?? '\u200B',
      context: trimmed,
    });
  }

  return findings;
}

function scanTool(
  tool: ToolDef,
  server: Pick<ServerEntry, 'id' | 'name'>,
): PromptInjectionFinding[] {
  const base = { serverId: server.id, serverName: server.name, toolName: tool.name };
  const findings: PromptInjectionFinding[] = [
    ...scanField(tool.name, { ...base, location: 'tool_name' }),
    ...scanField(tool.description ?? '', { ...base, location: 'tool_description' }),
  ];

  walkProperties(tool.inputSchema.properties, '', (name, prop, path) => {
    findings.push(...scanField(name, { ...base, location: 'parameter_name', path }));
    findings.push(
      ...scanField(prop.description ?? '', { ...base, location: 'parameter_description', path }),
    );
  });

  return findings;
}

export function scanPromptInjection(servers: ServerEntry[]): PromptInjectionReport {
  const connected = getConnectedServers(servers);
  const tools = connected.flatMap((server) => getAllTools(server));
  const findings = connected.flatMap((server) =>
    getAllTools(server).flatMap((tool) => scanTool(tool, server)),
  );

  return {
    findings: findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    scannedToolCount: tools.length,
  };
}

function severityRank(severity: PromptInjectionFinding['severity']): number {
  switch (severity) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
}

export function highlightFinding(text: string, matched: string): HighlightPart[] {
  if (!matched) return [{ text, highlight: false }];
  const index = text.toLowerCase().indexOf(matched.toLowerCase());
  if (index < 0) return [{ text, highlight: false }];
  const parts: HighlightPart[] = [];
  if (index > 0) parts.push({ text: text.slice(0, index), highlight: false });
  parts.push({ text: text.slice(index, index + matched.length), highlight: true });
  const rest = text.slice(index + matched.length);
  if (rest) parts.push({ text: rest, highlight: false });
  return parts;
}

export function locationLabel(location: InjectionFindingLocation): string {
  switch (location) {
    case 'tool_name':
      return 'Tool name';
    case 'tool_description':
      return 'Tool description';
    case 'parameter_name':
      return 'Parameter name';
    case 'parameter_description':
      return 'Parameter description';
  }
}
