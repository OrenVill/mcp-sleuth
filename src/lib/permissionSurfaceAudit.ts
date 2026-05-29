import type { ServerEntry, ToolDef, JsonSchemaProperty } from '../types';
import { getAllTools, getConnectedServers } from './serverTools';

export type PermissionCategory =
  | 'filesystem'
  | 'network'
  | 'shell'
  | 'data_read'
  | 'data_write'
  | 'destructive'
  | 'admin'
  | 'credential';

export type PermissionSignalSource =
  | 'tool_name'
  | 'tool_description'
  | 'parameter_name'
  | 'parameter_description';

export interface PermissionSignal {
  category: PermissionCategory;
  source: PermissionSignalSource;
  text: string;
  path?: string;
}

export interface ToolPermissionProfile {
  toolName: string;
  categories: PermissionCategory[];
  signals: PermissionSignal[];
}

export interface ServerPermissionSurface {
  serverId: string;
  serverName: string;
  toolCount: number;
  categoryCounts: Record<PermissionCategory, number>;
  tools: ToolPermissionProfile[];
  riskSummary: string;
}

export interface PermissionSurfaceReport {
  servers: ServerPermissionSurface[];
}

const CATEGORY_ORDER: PermissionCategory[] = [
  'filesystem',
  'network',
  'shell',
  'destructive',
  'credential',
  'data_write',
  'data_read',
  'admin',
];

const RULES: Array<{
  category: PermissionCategory;
  patterns: RegExp[];
}> = [
  {
    category: 'filesystem',
    patterns: [
      /\b(file|path|directory|dir|folder|read_?file|write_?file|unlink|rmdir|mkdir|chmod|fs)\b/i,
      /\b(open|save|load|upload|download).{0,20}(file|path)\b/i,
    ],
  },
  {
    category: 'network',
    patterns: [
      /\b(http|https|url|uri|fetch|request|api|webhook|socket|dns|curl|wget|endpoint)\b/i,
      /\b(remote|outbound|inbound).{0,15}(call|request|host)\b/i,
    ],
  },
  {
    category: 'shell',
    patterns: [
      /\b(shell|bash|sh\b|cmd|command|exec|execute|subprocess|terminal|powershell)\b/i,
      /\brun_.{0,10}(command|script)\b/i,
    ],
  },
  {
    category: 'destructive',
    patterns: [
      /\b(delete|remove|destroy|drop|truncate|purge|wipe|erase|kill|terminate)\b/i,
      /\b(permanently|irreversible|force)\b/i,
    ],
  },
  {
    category: 'credential',
    patterns: [
      /\b(password|secret|token|api[-_]?key|bearer|credential|auth)\b/i,
    ],
  },
  {
    category: 'data_write',
    patterns: [
      /\b(insert|update|upsert|create|write|set|patch|put|post|publish|commit|save)\b/i,
      /\b(modify|mutate|append|push)\b/i,
    ],
  },
  {
    category: 'data_read',
    patterns: [
      /\b(read|get|list|query|search|select|fetch|lookup|find|retrieve)\b/i,
    ],
  },
  {
    category: 'admin',
    patterns: [
      /\b(admin|root|sudo|privilege|permission|grant|revoke|iam|role)\b/i,
      /\b(configure|provision|deploy)\b/i,
    ],
  },
];

function emptyCounts(): Record<PermissionCategory, number> {
  return {
    filesystem: 0,
    network: 0,
    shell: 0,
    data_read: 0,
    data_write: 0,
    destructive: 0,
    admin: 0,
    credential: 0,
  };
}

function matchCategories(text: string): PermissionCategory[] {
  const hits = new Set<PermissionCategory>();
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(text))) hits.add(rule.category);
  }
  return [...hits];
}

function scanText(
  text: string,
  source: PermissionSignalSource,
  path?: string,
): PermissionSignal[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const signals: PermissionSignal[] = [];
  for (const category of matchCategories(trimmed)) {
    signals.push({ category, source, text: trimmed.slice(0, 120), path });
  }
  return signals;
}

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

function auditTool(tool: ToolDef): ToolPermissionProfile {
  const signals: PermissionSignal[] = [
    ...scanText(tool.name, 'tool_name'),
    ...scanText(tool.description ?? '', 'tool_description'),
  ];

  walkProperties(tool.inputSchema.properties, '', (name, prop, path) => {
    signals.push(...scanText(name, 'parameter_name', path));
    signals.push(...scanText(prop.description ?? '', 'parameter_description', path));
  });

  const deduped = dedupeSignals(signals);
  const categories = [...new Set(deduped.map((s) => s.category))].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b),
  );

  return { toolName: tool.name, categories, signals: deduped };
}

function dedupeSignals(signals: PermissionSignal[]): PermissionSignal[] {
  const seen = new Set<string>();
  const out: PermissionSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.category}|${signal.source}|${signal.path ?? ''}|${signal.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

function buildRiskSummary(
  categoryCounts: Record<PermissionCategory, number>,
  toolCount: number,
): string {
  const active = CATEGORY_ORDER.filter((c) => categoryCounts[c] > 0);
  if (active.length === 0) {
    return `No obvious permission signals across ${toolCount} tool(s). Review manually before trusting.`;
  }
  const parts = active.map((c) => `${categoryLabel(c)} (${categoryCounts[c]} signal${categoryCounts[c] === 1 ? '' : 's'})`);
  return `Inferred risk surface across ${toolCount} tool(s): ${parts.join(', ')}.`;
}

export function categoryLabel(category: PermissionCategory): string {
  switch (category) {
    case 'filesystem':
      return 'Filesystem';
    case 'network':
      return 'Network';
    case 'shell':
      return 'Shell / process';
    case 'data_read':
      return 'Data read';
    case 'data_write':
      return 'Data write';
    case 'destructive':
      return 'Destructive';
    case 'admin':
      return 'Admin / privilege';
    case 'credential':
      return 'Credential handling';
  }
}

function auditServer(server: ServerEntry): ServerPermissionSurface {
  const tools = getAllTools(server).map(auditTool);
  const categoryCounts = emptyCounts();
  for (const tool of tools) {
    for (const category of tool.categories) {
      categoryCounts[category] += tool.signals.filter((s) => s.category === category).length;
    }
  }

  return {
    serverId: server.id,
    serverName: server.name,
    toolCount: tools.length,
    categoryCounts,
    tools,
    riskSummary: buildRiskSummary(categoryCounts, tools.length),
  };
}

export function auditPermissionSurface(servers: ServerEntry[]): PermissionSurfaceReport {
  return {
    servers: getConnectedServers(servers).map(auditServer),
  };
}
