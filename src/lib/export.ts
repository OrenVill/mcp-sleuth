import type { ServerEntry, ToolDef, JsonSchema, JsonSchemaProperty } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

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

function renderTool(tool: ToolDef): string {
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
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Markdown export
// ---------------------------------------------------------------------------

export function exportAsMarkdown(server: ServerEntry): string {
  const sections: string[] = [];

  // Title + meta
  sections.push(`# ${server.name}`);
  if (server.description) {
    sections.push('');
    sections.push(server.description);
  }
  sections.push('');
  sections.push(`URL: ${server.url}`);

  // Tools
  const tools = server.tools ?? [];
  const discovered = server.discovered ?? [];
  const toolCount = tools.length + discovered.length;

  sections.push('');
  sections.push(`## Tools (${toolCount})`);

  if (tools.length === 0 && discovered.length === 0) {
    sections.push('');
    sections.push('_No tools available._');
  } else {
    for (const tool of tools) {
      sections.push('');
      sections.push(renderTool(tool));
    }

    if (discovered.length > 0) {
      sections.push('');
      sections.push(`## Discovered Tools (${discovered.length})`);
      for (const tool of discovered) {
        sections.push('');
        sections.push(renderTool(tool));
      }
    }
  }

  // Resources
  const resources = server.resources ?? [];
  const resourceTemplates = server.resourceTemplates ?? [];
  const resourceCount = resources.length + resourceTemplates.length;

  sections.push('');
  sections.push(`## Resources (${resourceCount})`);

  if (resourceCount === 0) {
    sections.push('');
    sections.push('_No resources available._');
  } else {
    for (const r of resources) {
      const desc = r.description ? ` — ${r.description}` : '';
      sections.push(`- \`${r.uri}\` — ${r.name}${desc}`);
    }
    if (resourceTemplates.length > 0) {
      sections.push('');
      sections.push('**Resource Templates:**');
      for (const rt of resourceTemplates) {
        const desc = rt.description ? ` — ${rt.description}` : '';
        sections.push(`- \`${rt.uriTemplate}\` — ${rt.name}${desc}`);
      }
    }
  }

  // Prompts
  const prompts = server.prompts ?? [];

  sections.push('');
  sections.push(`## Prompts (${prompts.length})`);

  if (prompts.length === 0) {
    sections.push('');
    sections.push('_No prompts available._');
  } else {
    for (const p of prompts) {
      sections.push('');
      sections.push(`### ${p.name}`);
      if (p.description) {
        sections.push('');
        sections.push(p.description);
      }
      if (p.arguments && p.arguments.length > 0) {
        const argStrings = p.arguments.map((a) =>
          a.required ? `${a.name} (required)` : a.name
        );
        sections.push('');
        sections.push(`Arguments: ${argStrings.join(', ')}`);
      }
    }
  }

  return sections.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

export function exportAsJson(server: ServerEntry): string {
  const data = {
    name: server.name,
    url: server.url,
    ...(server.description !== undefined ? { description: server.description } : {}),
    tools: (server.tools ?? []).map((t) => ({
      name: t.name,
      ...(t.description !== undefined ? { description: t.description } : {}),
      inputSchema: t.inputSchema,
    })),
    resources: (server.resources ?? []).map((r) => ({
      uri: r.uri,
      name: r.name,
      ...(r.description !== undefined ? { description: r.description } : {}),
      ...(r.mimeType !== undefined ? { mimeType: r.mimeType } : {}),
    })),
    resourceTemplates: (server.resourceTemplates ?? []).map((rt) => ({
      uriTemplate: rt.uriTemplate,
      name: rt.name,
      ...(rt.description !== undefined ? { description: rt.description } : {}),
      ...(rt.mimeType !== undefined ? { mimeType: rt.mimeType } : {}),
    })),
    prompts: (server.prompts ?? []).map((p) => ({
      name: p.name,
      ...(p.description !== undefined ? { description: p.description } : {}),
      arguments: p.arguments ?? [],
    })),
  };
  return JSON.stringify(data, null, 2);
}

// ---------------------------------------------------------------------------
// File download helper
// ---------------------------------------------------------------------------

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function serverSlug(name: string): string {
  return slugify(name);
}
